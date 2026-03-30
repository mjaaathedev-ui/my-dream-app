// Lovable auth removed - using Supabase auth directly
export const lovable = {
  auth: {
    signInWithOAuth: async () => ({ error: new Error('Use Supabase auth directly') }),
  },
};