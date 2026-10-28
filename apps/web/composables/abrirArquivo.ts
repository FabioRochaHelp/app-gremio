/**
 * Abre um arquivo cujo link temporário ainda vai ser pedido à API. A janela é aberta
 * antes da requisição porque navegadores de celular bloqueiam window.open depois de um await.
 */
export async function abrirArquivo(obterUrl: () => Promise<string>): Promise<void> {
  const janela = window.open('', '_blank');
  try {
    const url = await obterUrl();
    if (janela) janela.location.href = url;
    else window.location.href = url;
  } catch (erro) {
    janela?.close();
    throw erro;
  }
}
