# Requirements Document

## Introduction

This feature adds a public-facing marketing website for Safend Secure Solutions (safends.com), a security services company that provides security guards, housekeeping staff, bouncers, and armed security personnel for events, businesses, and personal residences. The marketing website is the public entry point of the application and showcases the company's services, brand, and contact information to prospective clients.

The marketing website will be served at the application root route (`/`). Because the existing ERP login screen currently occupies the root route, this feature also relocates the ERP login to a dedicated route (`/login`) and updates all session, logout, and protected-route redirects that previously pointed at the root. The marketing website includes a prominent "Login" action that navigates visitors to the relocated ERP login route, providing existing ERP users a clear path into the internal platform.

This document specifies the behavior of the public marketing site and the login-relocation changes. It does not change ERP authentication logic, role-based routing destinations, or any internal module behavior beyond the route at which the login screen is hosted and the redirect targets that reference it.

## Glossary

- **Marketing_Site**: The public-facing marketing website served at the root route (`/`), composed of navigable content sections and a site navigation bar.
- **Marketing_Page**: A rendered route of the Marketing_Site (for example the home page) that a public visitor can access without authentication.
- **Navigation_Bar**: The persistent header component of the Marketing_Site containing the Safend logo, in-page section links, and the Login_Action.
- **Login_Action**: The prominent "Login" control displayed by the Marketing_Site that navigates the visitor to the Login_Route.
- **Login_Route**: The dedicated application route (`/login`) that hosts the relocated ERP login screen.
- **Login_Screen**: The existing ERP login user interface (rendered by `Index.tsx`) containing the LoginForm, employee verification, and onboarding entry points.
- **ERP_Application**: The existing internal Safend operations platform reached after successful authentication, including the dashboard, sales, operations, accounts, and HR modules.
- **Session_Redirect**: The logic that, when an authenticated Supabase session exists on the Login_Screen, navigates the user to a role-appropriate ERP destination.
- **Logout_Redirect**: The logic that navigates a user to the login destination after sign-out completes.
- **Protected_Route_Redirect**: The logic that navigates an unauthenticated or unauthorized user away from a protected ERP route to the login destination.
- **Visitor**: A public, unauthenticated user of the Marketing_Site.
- **Service_Section**: The Marketing_Page region that presents the company's security service offerings (security guards, housekeeping staff, bouncers, armed security personnel).
- **Contact_Section**: The Marketing_Page region that presents the company's contact information and a means for a Visitor to make an enquiry.
- **Brand_Color**: The Safend primary brand color, hexadecimal value `#D71920`.

## Requirements

### Requirement 1: Public Marketing Home Page at Root

**User Story:** As a prospective client, I want to land on a marketing home page when I visit the site root, so that I can learn about Safend's security services without logging in.

#### Acceptance Criteria

1. WHEN a Visitor requests the root route, THE Marketing_Site SHALL render the marketing home Marketing_Page and complete initial content display within 3 seconds of the request.
2. WHEN a Visitor requests the root route, THE Marketing_Site SHALL render the marketing home Marketing_Page without prompting the Visitor for credentials and without redirecting the Visitor to the Login_Route.
3. THE Marketing_Site SHALL render the marketing home Marketing_Page with a hero region, a Service_Section, an about region, and a Contact_Section displayed in that top-to-bottom order, each visible to the Visitor.
4. THE Marketing_Site SHALL display the Safend logo within the hero region of the marketing home Marketing_Page.
5. THE Marketing_Site SHALL apply the Brand_Color as the visual treatment of at least one prominent element on the marketing home Marketing_Page.

### Requirement 2: Showcase Security Services

**User Story:** As a prospective client, I want to see the security services Safend offers, so that I can decide whether they meet my needs.

#### Acceptance Criteria

1. THE Service_Section SHALL display a distinct service entry for each of the following offerings: security guards, housekeeping staff, bouncers, and armed security personnel.
2. THE Service_Section SHALL display a non-empty name of 1 to 60 characters for each service entry.
3. THE Service_Section SHALL display a non-empty description of 1 to 500 characters for each service entry.
4. THE Service_Section SHALL display text stating that Safend serves events, businesses, and personal residences.
5. IF a service entry's name or description is unavailable, THEN THE Service_Section SHALL omit that service entry from display.

### Requirement 3: Site Navigation

**User Story:** As a Visitor, I want a navigation bar, so that I can move between sections of the marketing page and reach the login.

#### Acceptance Criteria

1. THE Navigation_Bar SHALL display the Safend logo, a link to the Service_Section, a link to the about region, a link to the Contact_Section, and the Login_Action.
2. WHEN a Visitor activates a section link in the Navigation_Bar, THE Marketing_Site SHALL scroll the corresponding section into view on the marketing home Marketing_Page within 1 second, positioning the start of the corresponding section below the Navigation_Bar so that it is not obscured by the Navigation_Bar.
3. IF the corresponding section cannot be scrolled into view when a Visitor activates a section link, THEN THE Marketing_Site SHALL leave the current scroll position unchanged and SHALL remain on the marketing home Marketing_Page.
4. WHILE a Visitor scrolls the marketing home Marketing_Page, THE Navigation_Bar SHALL remain visible at the top of the viewport with the section links and the Login_Action reachable.

### Requirement 4: Prominent Login Action to ERP

**User Story:** As an existing ERP user, I want a prominent Login button on the marketing site, so that I can quickly reach the ERP login screen.

#### Acceptance Criteria

1. THE Marketing_Site SHALL display the Login_Action in the Navigation_Bar with a visible text label of "Login".
2. WHEN a Visitor activates the Login_Action, THE Marketing_Site SHALL navigate the Visitor to the Login_Route.
3. THE Login_Action SHALL render with the Brand_Color as its fill, and the Login_Action fill color SHALL differ from the fill and text color applied to the section links in the Navigation_Bar.
4. IF navigation to the Login_Route does not complete when a Visitor activates the Login_Action, THEN THE Marketing_Site SHALL keep the Visitor on the current Marketing_Page and display an error indication that the login screen could not be opened.

### Requirement 5: Relocate ERP Login to a Dedicated Route

**User Story:** As an existing ERP user, I want the ERP login screen to live at a dedicated route, so that the marketing site can occupy the root while I can still sign in.

#### Acceptance Criteria

1. WHEN a Visitor requests the Login_Route, THE ERP_Application SHALL render the existing Login_Screen.
2. THE ERP_Application SHALL render the LoginForm on the relocated Login_Screen with the same credential-entry fields and the same authentication outcome it exhibited at the root route prior to relocation, with no functional change.
3. WHEN a Visitor requests the root route, THE Marketing_Site SHALL render the marketing home Marketing_Page instead of the Login_Screen.
4. WHEN a Visitor activates the employee verification entry point on the relocated Login_Screen, THE ERP_Application SHALL display the employee verification interface.
5. WHEN a Visitor activates an onboarding entry point on the relocated Login_Screen, THE ERP_Application SHALL display the onboarding form corresponding to the activated entry point.

### Requirement 6: Authenticated Session Redirect from Login Route

**User Story:** As an authenticated ERP user, I want to be sent to my ERP destination when I open the login route while signed in, so that I do not have to log in again.

#### Acceptance Criteria

1. WHEN a user with a valid, non-expired Supabase session requests the Login_Route, THE Session_Redirect SHALL navigate the user to the role-appropriate ERP destination within 2 seconds of session confirmation.
2. WHERE the user role is admin or branch_admin, THE Session_Redirect SHALL navigate the user to `/dashboard`.
3. WHERE the user role is sales, THE Session_Redirect SHALL navigate the user to `/sales`.
4. WHERE the user role is operations, THE Session_Redirect SHALL navigate the user to `/operations`.
5. WHERE the user role is accounts, THE Session_Redirect SHALL navigate the user to `/accounts`.
6. WHERE the user role is hr, THE Session_Redirect SHALL navigate the user to `/hr`.
7. WHERE no role is cached for the authenticated user, OR the cached role is not one of admin, branch_admin, sales, operations, accounts, or hr, THE Session_Redirect SHALL navigate the user to `/sales`.
8. WHILE no active Supabase session exists for a user requesting the Login_Route, THE Session_Redirect SHALL keep the user on the Login_Screen without navigating away.
9. IF the Supabase session verification cannot be completed due to an error or network failure when the Login_Route is requested, THEN THE Session_Redirect SHALL keep the user on the Login_Screen and present an error indication that session verification failed.

### Requirement 7: Logout Redirect Targets the Login Route

**User Story:** As an ERP user signing out, I want to land on the login screen, so that I can sign in again without navigating to a marketing page first.

#### Acceptance Criteria

1. WHEN sign-out completes, THE Logout_Redirect SHALL navigate the user to the Login_Route (`/login`) within 3 seconds, such that the resulting browser destination path is `/login` and not the marketing root route (`/`).
2. WHEN sign-out is initiated, THE Logout_Redirect SHALL clear the cached authentication state, defined as removing the localStorage userRole entry and terminating the Supabase session, before navigating to the Login_Route.
3. IF clearing the cached authentication state fails, THEN THE Logout_Redirect SHALL still navigate the user to the Login_Route (`/login`) and SHALL NOT retain the user on the current page.

### Requirement 8: Protected Route Redirect Targets the Login Route

**User Story:** As the ERP platform, I want unauthenticated visitors to protected pages to be sent to the login screen, so that access control routes users to the correct entry point.

#### Acceptance Criteria

1. IF an unauthenticated user requests a protected ERP route (one of `/dashboard`, `/sales`, `/operations`, `/accounts`, `/hr`, `/profile`, `/office-admin`), THEN THE Protected_Route_Redirect SHALL navigate the user to the Login_Route (`/login`).
2. IF an authenticated user whose role is neither included in the requested protected ERP route's allowed-roles set nor equal to "admin" requests that route, THEN THE Protected_Route_Redirect SHALL navigate the user to the Login_Route (`/login`).
3. WHILE the user's authentication state and role are being evaluated, THE Protected_Route_Redirect SHALL withhold the protected route content and SHALL NOT navigate the user until the evaluation completes or 5 seconds elapse.
4. IF the authentication session check fails or does not complete within 5 seconds, THEN THE Protected_Route_Redirect SHALL treat the user as unauthenticated and navigate the user to the Login_Route (`/login`).

### Requirement 9: Contact and Enquiry

**User Story:** As a prospective client, I want to find Safend's contact details and a way to make an enquiry, so that I can engage their services.

#### Acceptance Criteria

1. THE Contact_Section SHALL display company contact information comprising at minimum a contact phone number, a contact email address, and a physical business address.
2. THE Contact_Section SHALL provide an enquiry form containing input controls for the enquirer name, a contact method (email address or phone number), and the enquiry message, together with a control that submits the enquiry.
3. WHEN a Visitor submits an enquiry with all required fields (enquirer name, contact method, enquiry message) completed and valid, THE Contact_Section SHALL display a confirmation message indicating the enquiry was received within 5 seconds of submission.
4. IF a Visitor submits an enquiry with one or more required fields missing or empty, THEN THE Contact_Section SHALL prevent submission and display a validation message identifying each missing required field, while retaining the values the Visitor already entered.
5. IF a Visitor submits an enquiry in which the enquirer name exceeds 100 characters, the enquiry message exceeds 2000 characters, or the contact method does not match a valid email address or phone number format, THEN THE Contact_Section SHALL prevent submission and display a validation message identifying each invalid field.
6. IF an enquiry submission with all required fields valid fails to be delivered, THEN THE Contact_Section SHALL display an error message indicating the enquiry was not sent and SHALL retain the values the Visitor entered.

### Requirement 10: Responsive Presentation

**User Story:** As a Visitor on a mobile device, I want the marketing site to adapt to my screen, so that I can read content and reach the login on any device.

#### Acceptance Criteria

1. WHILE the viewport width is below 768 pixels, THE Marketing_Site SHALL keep the Login_Action visible within the viewport bounds and activatable to navigate the Visitor to the Login_Route.
2. WHILE the viewport width is below 768 pixels, THE Marketing_Site SHALL arrange the hero region, the Service_Section, the about region, and the Contact_Section vertically in a single column.
3. WHILE the viewport width is below 768 pixels, THE Marketing_Site SHALL render the marketing home Marketing_Page content within the viewport width without introducing horizontal scrolling.
