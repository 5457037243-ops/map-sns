import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 
'https://sonvhbbvhfixwacoyahd.supabase.co'
const supabaseKey = 
'sb_publishable_39oUmJbEFEpaksdSoren9w_r9TEVFLb'

export const supabase = createClient(supabaseUrl, supabaseKey)

