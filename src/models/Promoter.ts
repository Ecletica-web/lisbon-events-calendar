/**
 * Domain model for Promoter
 */

export interface Promoter {
  promoter_id: string
  name: string
  slug: string
  instagram_handle?: string
  website_url?: string
  description_short?: string
  primary_image_url?: string
  is_active: boolean
}
