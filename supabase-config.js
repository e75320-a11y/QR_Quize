// Supabase 설정값을 여기에 입력하세요.
// Supabase 대시보드 → 좌측 ⚙️ 프로젝트 설정 → API 에서
// 'Project URL'과 'anon public' 키를 확인할 수 있습니다.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://xinavsqxfzodhwwzmbki.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpbmF2c3F4ZnpvZGh3d3ptYmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNDM3NzQsImV4cCI6MjEwNzYxOTc3NH0.tg4RJf3sYVcH11t-MmjzPNWsIOQo2oj8d4ep9mEOgic';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
