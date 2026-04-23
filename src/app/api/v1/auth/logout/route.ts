export async function POST() {
  return Response.json({ success: true, data: { message: 'Logged out successfully' } });
}
