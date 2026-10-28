import { useAuthStore } from '~/stores/auth';

const PUBLICAS = ['/login', '/ativar'];

export default defineNuxtRouteMiddleware(async (para) => {
  const auth = useAuthStore();
  await auth.iniciar();
  // O layout mostra o aviso de servidor indisponível; não adianta redirecionar.
  if (auth.indisponivel) return;

  if (PUBLICAS.includes(para.path)) {
    return auth.usuario ? navigateTo('/') : undefined;
  }
  if (!auth.usuario) {
    return navigateTo('/login');
  }
  if (!auth.usuario.termoAceito && para.path !== '/termo') {
    return navigateTo('/termo');
  }
  if (para.path.startsWith('/tesouraria') && !auth.tesoureiro) {
    return navigateTo('/');
  }
});
