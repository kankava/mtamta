// All fields use snake_case to match Go JSON tags — consistent across web and mobile.
export interface User {
  id: string
  display_name: string
  email: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string // ISO 8601 UTC
  updated_at: string
}
