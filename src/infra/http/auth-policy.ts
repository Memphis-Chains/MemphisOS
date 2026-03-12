export type EndpointAuthPolicy = {
  path: string;
  method: 'GET' | 'POST';
  requiresAuth: boolean;
};

export const apiAuthPolicy: EndpointAuthPolicy[] = [
  { method: 'GET', path: '/health', requiresAuth: false },
  { method: 'GET', path: '/v1/providers/health', requiresAuth: false },
  { method: 'GET', path: '/v1/metrics', requiresAuth: true },
  { method: 'GET', path: '/v1/ops/status', requiresAuth: true },
  { method: 'GET', path: '/v1/sessions', requiresAuth: true },
  { method: 'GET', path: '/v1/sessions/:sessionId/events', requiresAuth: true },
  { method: 'POST', path: '/v1/chat/generate', requiresAuth: true },
  { method: 'POST', path: '/v1/vault/init', requiresAuth: true },
  { method: 'POST', path: '/v1/vault/encrypt', requiresAuth: true },
  { method: 'POST', path: '/v1/vault/decrypt', requiresAuth: true },
  { method: 'POST', path: '/v1/soul/replay', requiresAuth: true },
  { method: 'POST', path: '/v1/soul/loop-step', requiresAuth: true },
  { method: 'GET', path: '/v1/vault/entries', requiresAuth: true },
  { method: 'POST', path: '/v1/admin/dual-approval/request', requiresAuth: true },
  { method: 'POST', path: '/v1/admin/dual-approval/approve', requiresAuth: true },
  { method: 'POST', path: '/v1/admin/dual-approval/cancel', requiresAuth: true },
  { method: 'GET', path: '/v1/admin/dual-approval/:requestId', requiresAuth: true },
];

export function isAuthRequired(method: string, path: string): boolean {
  for (const rule of apiAuthPolicy) {
    if (rule.method !== method) continue;

    if (rule.path === path) return rule.requiresAuth;

    if (rule.path.includes(':')) {
      const pattern = '^' + rule.path.replace(/:[^/]+/g, '[^/]+') + '$';
      if (new RegExp(pattern).test(path)) {
        return rule.requiresAuth;
      }
    }
  }

  return true;
}
