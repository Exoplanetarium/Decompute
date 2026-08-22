// Maps a `users` row (snake_case) to the shape the frontend expects (camelCase).
export const toUserDto = (row) => ({
  id: row.id,
  email: row.email,
  wallet: row.wallet,
  displayName: row.display_name,
  role: row.role,
  balanceUsdc: row.balance_usdc,
});
