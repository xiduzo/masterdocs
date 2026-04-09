import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/content/$roadmap/$track/$slug')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/admin/content/$roadmap/$track/$slug"!</div>
}
