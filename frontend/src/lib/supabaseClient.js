import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lkfpdrskgfffwtzbtlnq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZnBkcnNrZ2ZmZnd0emJ0bG5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDEyNzYsImV4cCI6MjEwMzA3NzI3Nn0.suk69wAZtVKR62BI5QpEFCGfUVKyy_mY6IslM9zoxHw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);