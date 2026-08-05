export class RoutingProvider {
  async getRoute() { throw new Error('getRoute غير منفذة'); }
  async getMatrix() { throw new Error('getMatrix غير منفذة'); }
  async optimizeRoute() { throw new Error('optimizeRoute غير منفذة'); }
  async healthCheck() { return false; }
}
