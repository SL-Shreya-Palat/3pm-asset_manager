/**
 * Buddy AI — Tool implementations
 *
 * Each tool receives BuddyAIContext and returns data for the agent.
 */

export { getFeatureGuide, type GetFeatureGuideResult } from "./get-feature-guide";
export { listProjects, type ListProjectsResult } from "./list-projects";
export { getProjectDetails, type GetProjectDetailsResult } from "./get-project-details";
export { getStaffDirectory, type GetStaffDirectoryResult } from "./get-staff-directory";
export { listLeaveRequests, type ListLeaveRequestsResult } from "./list-leave-requests";
export { listBusinessContacts, type ListBusinessContactsResult } from "./list-business-contacts";
export { listAssets, type ListAssetsResult } from "./list-assets";
export { listTasksByProject, type ListTasksByProjectResult } from "./list-tasks-by-project";
export { listLeads, type ListLeadsResult } from "./list-leads";
export { listQuotes, type ListQuotesResult } from "./list-quotes";
export { listInvoices, type ListInvoicesResult } from "./list-invoices";
export { listClaims, type ListClaimsResult } from "./list-claims";
export { getSitesForContact, type GetSitesForContactResult } from "./get-sites-for-contact";
export { createProject, type CreateProjectInput, type CreateProjectResult } from "./create-project";
export { updateProject, type UpdateProjectInput, type UpdateProjectResult } from "./update-project";
export { getProjectForUpdate } from "./get-project-for-update";
export {
  createBusinessContact,
  type CreateBusinessContactInput,
  type CreateBusinessContactResult,
} from "./create-business-contact";
export {
  updateBusinessContact,
  type UpdateBusinessContactInput,
  type UpdateBusinessContactResult,
} from "./update-business-contact";
export { getBusinessContactForUpdate } from "./get-business-contact-for-update";
