import { ClaimsPageContent } from "./claims-page-content";

export default async function ClaimsPage({ params }: { params: { userId: string } }) {
  return <ClaimsPageContent userId={params.userId} />;
}
