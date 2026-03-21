console.log('URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Key:', import.meta.env.VITE_SUPABASE_ANON_KEY);

export default function TestEnv() {
  return (
    <div>
      <h1>Check Console for Environment Variables</h1>
    </div>
  );
}