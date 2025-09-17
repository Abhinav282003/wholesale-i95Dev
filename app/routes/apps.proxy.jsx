import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const formData = await request.formData();
    console.log("Form data received:", Object.fromEntries(formData));
    
    // Try multiple ways to get the shop parameter
    let shop;
    let session;
    
    try {
      // First try the proper app proxy authentication
      const { shop: proxyShop } = await authenticate.public.appProxy(request);
      shop = proxyShop;
      console.log("Shop from authenticate.public.appProxy:", shop);
    } catch (error) {
      console.log("App proxy authentication failed:", error.message);
    }
    
    // If that didn't work, try getting shop from URL parameters or form data
    if (!shop) {
      const url = new URL(request.url);
      shop = url.searchParams.get("shop") || formData.get("shop");
      console.log("Shop from URL/form data:", shop);
    }
    
    // If still no shop, try getting it from referrer or headers
    if (!shop) {
      const referrer = request.headers.get("referer");
      console.log("Referrer:", referrer);
      if (referrer) {
        const referrerUrl = new URL(referrer);
        // Extract shop from subdomain like https://shop-name.myshopify.com
        const hostname = referrerUrl.hostname;
        if (hostname.includes('.myshopify.com')) {
          shop = hostname.replace('.myshopify.com', '');
          console.log("Shop extracted from referrer:", shop);
        }
      }
    }
    
    console.log("Final shop value:", shop);
    
    if (!shop) {
      console.error("Could not determine shop from any source");
      return json({ error: "Shop parameter missing" }, { status: 400 });
    }

    // Load the session for this shop to get the admin API access
    const { sessionStorage } = await import("../shopify.server");
    
    // Try different session key formats
    session = await sessionStorage.loadSession(`offline_${shop}`);
    if (!session) {
      session = await sessionStorage.loadSession(`offline_${shop}.myshopify.com`);
    }
    
    console.log("Session found:", !!session);
    
    if (!session) {
      console.error("No session found for shop:", shop);
      // List available sessions for debugging
      try {
        const sessions = await sessionStorage.findSessionsByShop(shop);
        console.log("Available sessions for shop:", sessions?.length || 0);
      } catch (e) {
        console.log("Could not list sessions");
      }
      return json({ error: "App not installed for this shop" }, { status: 401 });
    }

    // Create a proper admin context using the session
    const adminApiContext = {
      session,
      userAgent: 'Shopify App',
    };

    // Use the authenticate.admin method to get a proper admin client
    const mockRequest = {
      ...request,
      headers: new Headers({
        ...Object.fromEntries(request.headers.entries()),
        'authorization': `Bearer ${session.accessToken}`,
        'x-shopify-shop-domain': shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`
      })
    };

    let admin;
    try {
      const authResult = await authenticate.admin(mockRequest);
      admin = authResult.admin;
    } catch (authError) {
      console.log("Admin authentication failed, creating manual admin client");
      
      // Fallback: create admin client manually
      admin = {
        graphql: async (query, options = {}) => {
          const endpoint = `https://${shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`}/admin/api/2024-10/graphql.json`;
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': session.accessToken,
            },
            body: JSON.stringify({
              query: query,
              variables: options.variables || {}
            })
          });
          
          return {
            json: () => response.json()
          };
        }
      };
    }

    const companyInput = {
      company: {
        name: formData.get("companyName"),
        externalId: `ext-${Date.now()}`,
        note: `Created from Wholesale Registration form`,
      },
      companyContact: {
        email: formData.get("userEmail"),
        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
      }
    };

    // 1. Create company
    console.log("Creating company with input:", companyInput);
    const companyResponse = await admin.graphql(
      `#graphql
        mutation CreateCompany($input: CompanyCreateInput!) {
          companyCreate(input: $input) {
            company {
              id
              name
            }
            userErrors {
              field
              message
            }
          }
        }`,
      { variables: { input: companyInput } }
    );
    
    const companyJson = await companyResponse.json();
    console.log("Company creation response:", JSON.stringify(companyJson, null, 2));
    
    if (companyJson.errors) {
      console.error("GraphQL errors in company creation:", companyJson.errors);
      return json({ error: "GraphQL errors in company creation", details: companyJson.errors }, { status: 400 });
    }
    
    if (companyJson.data?.companyCreate?.userErrors?.length > 0) {
      console.error("Company creation errors:", companyJson.data.companyCreate.userErrors);
      return json({ error: "Failed to create company", details: companyJson.data.companyCreate.userErrors }, { status: 400 });
    }
    
    const companyId = companyJson.data?.companyCreate?.company?.id;
    console.log("Created company ID:", companyId);

    // 2. Create customer
    const customerInput = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("userEmail"),
      phone: formData.get("phone"),
    };

    console.log("Creating customer with input:", customerInput);
    const customerResponse = await admin.graphql(
      `#graphql
        mutation CreateCustomer($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer {
              id
              email
              firstName
              lastName
            }
            userErrors {
              field
              message
            }
          }
        }`,
      { variables: { input: customerInput } }
    );
    
    const customerJson = await customerResponse.json();
    console.log("Customer creation response:", JSON.stringify(customerJson, null, 2));
    
    if (customerJson.errors) {
      console.error("GraphQL errors in customer creation:", customerJson.errors);
      return json({ error: "GraphQL errors in customer creation", details: customerJson.errors }, { status: 400 });
    }
    
    if (customerJson.data?.customerCreate?.userErrors?.length > 0) {
      console.error("Customer creation errors:", customerJson.data.customerCreate.userErrors);
      return json({ error: "Failed to create customer", details: customerJson.data.customerCreate.userErrors }, { status: 400 });
    }
    
    const customerId = customerJson.data?.customerCreate?.customer?.id;
    console.log("Created customer ID:", customerId);

    // Only try to assign if both IDs exist
    if (companyId && customerId) {
      // 3. Assign customer to company as main contact
      console.log("Assigning customer to company:", { companyId, customerId });
      const assignResponse = await admin.graphql(
        `#graphql
          mutation AssignMainContact($companyId: ID!, $customerId: ID!) {
            companyAssignMainContact(companyId: $companyId, customerId: $customerId) {
              company {
                id
                mainContact {
                  id
                  firstName
                  lastName
                }
              }
              userErrors {
                field
                message
              }
            }
          }`,
        { variables: { companyId, customerId } }
      );
      
      const assignJson = await assignResponse.json();
      console.log("Assignment response:", JSON.stringify(assignJson, null, 2));
      
      if (assignJson.errors) {
        console.error("GraphQL errors in assignment:", assignJson.errors);
      }
      
      if (assignJson.data?.companyAssignMainContact?.userErrors?.length > 0) {
        console.error("Assignment errors:", assignJson.data.companyAssignMainContact.userErrors);
        return json({ error: "Failed to assign main contact", details: assignJson.data.companyAssignMainContact.userErrors }, { status: 400 });
      }
    } else {
      console.warn("Skipping assignment - missing IDs:", { companyId, customerId });
    }

    console.log("Successfully created company and customer:", { companyId, customerId });
    
    return json({ 
      success: true, 
      companyId, 
      customerId,
      message: "Company and customer created successfully!" 
    });
    
  } catch (error) {
    console.error("Error in proxy action:", error);
    return json({ error: "Internal server error", details: error.message }, { status: 500 });
  }
};

export const loader = async ({ request }) => {
  return json({ status: "App Proxy route working ✅" });
};

export default function ProxyRoute() {
  return (
    <div>
      <h1>App Proxy Route</h1>
      <p>App Proxy route working ✅</p>
      <p>This route handles form submissions from the storefront.</p>
    </div>
  );
}
