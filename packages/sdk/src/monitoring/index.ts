export class CharisMonitoring {
  attachExpress(app: any) {
    app.get('/health', (req: any, res: any) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }
}
