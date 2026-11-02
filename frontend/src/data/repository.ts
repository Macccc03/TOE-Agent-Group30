import { adaptTrace } from './adapter.ts';
import { rawTraces } from './mock.ts';

export type Scene = 'normal' | 'empty' | 'error';
// A local mock boundary. Replace this module's implementation when an API is agreed.
export const traceRepository = {
  async list(scene: Scene) {
    await new Promise(resolve => setTimeout(resolve, 180));
    if (scene === 'error') throw new Error('模拟请求失败。请选择“正常列表”恢复体验。');
    return scene === 'empty' ? [] : rawTraces.map(adaptTrace);
  },
  async get(id: string) {
    await new Promise(resolve => setTimeout(resolve, 120));
    const raw = rawTraces.find(trace => trace.trace_id === id);
    if (!raw) throw new Error('未找到这条调用记录，请返回调用列表。');
    return adaptTrace(raw);
  },
};
