declare module 'clubhouse:assets' {
  const assets: Record<string, { type: string; data: string; gzip?: boolean }>;
  export default assets;
}
