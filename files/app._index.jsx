import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Check if custom page already exists
  const pagesResponse = await admin.graphql(
    `#graphql
      query GetPages($first: Int!) {
        pages(first: $first) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }`,
    {
      variables: {
        first: 50,
      },
    },
  );

  const pagesData = await pagesResponse.json();
  const existingPage = pagesData.data?.pages?.edges?.find(
    edge => edge.node.title === "Wholesale Registration" || edge.node.handle === "quick-order"
  )?.node;

  // If page doesn't exist, create it automatically
  if (!existingPage) {
    try {
      // Create the page
      const pageResponse = await admin.graphql(
        `#graphql
          mutation CreatePage($page: PageCreateInput!) {
            pageCreate(page: $page) {
              page {
                id
                title
                handle
              }
              userErrors {
                code
                field
                message
              }
            }
          }`,
        {
          variables: {
            page: {
              title: "Wholesale Registration",
              handle: `quick-order-${Math.random().toString(36).substring(2, 15)}`,
              body: `
                <div id="protected-page-content">
                  <div id="login-required" style="text-align: center; padding: 40px;">
                    <p>Please login to view the content</p>
                    <a href="/account/login?return_url={{ request.path | url_encode }}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 16px;">Login</a>
                  </div>
                  
                 <div id="protected-content" style="display: none; text-align: center; padding: 40px;">
  <div style="max-width: 500px; margin: 0 auto; text-align: left;">
    <h2 style="margin-bottom: 20px;">Company Information</h2>
    <form method="post"  action="/apps/abc-373">
      <div style="margin-bottom: 16px;">
        <label>Company Name</label>
        <input type="text" name="companyName" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" required />
      </div>

      <div style="margin-bottom: 16px;">
        <label>First Name</label>
        <input type="text" name="firstName" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" required />
      </div>

      <div style="margin-bottom: 16px;">
        <label>Last Name</label>
        <input type="text" name="lastName" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" required />
      </div>

      <div style="margin-bottom: 16px;">
        <label>Location</label>
        <input type="text" name="location" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" />
      </div>

      <div style="margin-bottom: 16px;">
        <label>Tax ID</label>
        <input type="text" name="taxId" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" />
      </div>

      <div style="margin-bottom: 16px;">
        <label>Phone Number</label>
        <input type="tel" name="phone" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" />
      </div>

      <div style="margin-bottom: 16px;">
        <label>Company Email</label>
        <input type="email" name="companyEmail" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" />
      </div>

      <div style="margin-bottom: 16px;">
        <label>User Email</label>
        <input type="email" name="userEmail" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" required />
      </div>

      <button type="submit" style="background: #000; color: #fff; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer;">
        Submit
      </button>
    </form>
  </div>
</div>


                <script>
                  function checkCustomerLogin() {
                    // Check for customer object in window
                    if (typeof window.customer !== 'undefined' && window.customer && window.customer.id) {
                      showProtectedContent();
                      return;
                    }
                    
                    // Check Shopify analytics
                    if (typeof window.ShopifyAnalytics !== 'undefined' && 
                        window.ShopifyAnalytics.meta && 
                        window.ShopifyAnalytics.meta.page && 
                        window.ShopifyAnalytics.meta.page.customerId) {
                      showProtectedContent();
                      return;
                    }
                    
                    // Try /account.js API
                    fetch('/account.js')
                      .then(response => {
                        if (response.ok) {
                          return response.json();
                        }
                        throw new Error('Not logged in');
                      })
                      .then(customer => {
                        if (customer && customer.id) {
                          showProtectedContent();
                        } else {
                          showLoginRequired();
                        }
                      })
                      .catch(() => {
                        // Check for logout links
                        const logoutLinks = document.querySelectorAll('a[href*="/account/logout"]');
                        if (logoutLinks.length > 0) {
                          showProtectedContent();
                        } else {
                          showLoginRequired();
                        }
                      });
                  }
                  
                  function showProtectedContent() {
                    document.getElementById('login-required').style.display = 'none';
                    document.getElementById('protected-content').style.display = 'block';
                  }
                  
                  function showLoginRequired() {
                    document.getElementById('login-required').style.display = 'block';
                    document.getElementById('protected-content').style.display = 'none';
                  }
                  
                  checkCustomerLogin();
                  document.addEventListener('DOMContentLoaded', checkCustomerLogin);
                  setTimeout(checkCustomerLogin, 1000);
                  setTimeout(checkCustomerLogin, 3000);
                </script>
              `,
              isPublished: true,
            },
          },
        },
      );

      const pageData = await pageResponse.json();
      
      if (pageData.data?.pageCreate?.page?.id) {
        const pageId = pageData.data.pageCreate.page.id;
        
        // Get the main menu by handle
        const menuResponse = await admin.graphql(
          `#graphql
            query GetMainMenu {
              menus(first: 10) {
                edges {
                  node {
                    id
                    handle
                    title
                    items {
                      id
                      title
                      type
                      url
                      resourceId
                    }
                  }
                }
              }
            }`
        );

        const menuData = await menuResponse.json();
        const mainMenu = menuData.data?.menus?.edges?.find(
          edge => edge.node.handle === 'main-menu' || edge.node.title === 'Main menu'
        )?.node;
        
        console.log("Main menu found:", mainMenu ? { id: mainMenu.id, handle: mainMenu.handle, title: mainMenu.title } : "Not found");

        if (mainMenu) {
          // Check if our page is already in the menu
          const existingItem = mainMenu.items.find(
            item => item.title === "Wholesale Registration"
          );

          if (!existingItem) {
            // Add menu item to existing main menu using menuUpdate
            const updatedItems = [
              ...mainMenu.items.map(item => ({
                id: item.id,
                title: item.title,
                type: item.type,
                url: item.url,
                resourceId: item.resourceId
              })),
              {
                title: "Wholesale Registration",
                type: "PAGE",
                resourceId: pageId,
                url: `/pages/${pageData.data.pageCreate.page.handle}`
              }
            ];
            
            const menuUpdateResponse = await admin.graphql(
              `#graphql
                mutation UpdateMenu($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
                  menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
                    menu {
                      id
                      handle
                      items {
                        id
                        title
                      }
                    }
                    userErrors {
                      code
                      field
                      message
                    }
                  }
                }`,
              {
                variables: {
                  id: mainMenu.id,
                  title: mainMenu.title,
                  handle: mainMenu.handle,
                  items: updatedItems
                }
              }
            );
            
            const menuUpdateData = await menuUpdateResponse.json();
            if (menuUpdateData.data?.menuUpdate?.userErrors?.length > 0) {
              console.error("Menu update errors:", menuUpdateData.data.menuUpdate.userErrors);
            } else {
              console.log("Menu updated successfully with new page");
            }
          }
        } else {
          console.log("Main menu not found, creating new main menu");
          
          // Create a new main menu if it doesn't exist
          const newMenuResponse = await admin.graphql(
            `#graphql
              mutation CreateMenu($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
                menuCreate(title: $title, handle: $handle, items: $items) {
                  menu {
                    id
                    handle
                    items {
                      id
                      title
                    }
                  }
                  userErrors {
                    code
                    field
                    message
                  }
                }
              }`,
            {
              variables: {
                title: "Main menu",
                handle: "main-menu",
                items: [
                  {
                    title: "Home",
                    type: "FRONTPAGE",
                    url: "/"
                  },
                  {
                    title: "Custom Menu Page",
                    type: "PAGE",
                    resourceId: pageId,
                    url: `/pages/${pageData.data.pageCreate.page.handle}`
                  }
                ]
              }
            }
          );

          const newMenuData = await newMenuResponse.json();
          if (newMenuData.data?.menuCreate?.userErrors?.length > 0) {
            console.error("Menu creation errors:", newMenuData.data.menuCreate.userErrors);
          } else {
            console.log("New main menu created successfully");
          }
        }
      }
    } catch (error) {
      console.error("Error auto-creating page:", error);
    }
  }

  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const companyInput = {
    name: formData.get("companyName"),
    externalId: `ext-${Date.now()}`,
    taxExemptions: [], // optional
    note: `Created from Quick Order form`,
  };

  // 1. Create company
  const companyResponse = await admin.graphql(
    `#graphql
      mutation CreateCompany($input: CompanyCreateInput!) {
        companyCreate(company: $input) {
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
  const companyId = companyJson.data?.companyCreate?.company?.id;

  // 2. Create customer
  const customerInput = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("userEmail"),
    phone: formData.get("phone"),
  };

  const customerResponse = await admin.graphql(
    `#graphql
      mutation CreateCustomer($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
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
  const customerId = customerJson.data?.customerCreate?.customer?.id;

  // 3. Assign customer to company as main contact
  await admin.graphql(
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

  return { success: true, companyId, customerId };
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="Custom Menu App" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Custom Menu App 🎉
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Your app has been successfully installed! A custom page has been automatically created and added to your store's navigation menu.
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    What happened?
                  </Text>
                  <List>
                    <List.Item>
                      A new page titled "Custom Menu Page" was created in your store
                    </List.Item>
                    <List.Item>
                      The page was automatically added to your main navigation menu
                    </List.Item>
                    <List.Item>
                      Customers can now see and access this page from your storefront
                    </List.Item>
                  </List>
                </BlockStack>
                <Text variant="bodyMd" as="p">
                  Visit your storefront to see the new menu item in action!
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
