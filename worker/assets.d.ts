declare module 'clubhouse:assets' {
  const assets: Record<string, { type: string; data: string; etag: string }>;
  export default assets;
}
