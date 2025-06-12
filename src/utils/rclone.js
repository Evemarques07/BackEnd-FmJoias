// src/utils/rclone.js

const { exec } = require('child_process')
const path = require('path')

/**
 * Envia um arquivo local para o Google Drive usando Rclone.
 * @param {string} caminhoLocal - Caminho completo do arquivo local.
 * @param {string} caminhoDestinoNoDrive - Caminho relativo no remote "gdrive".
 */
function enviarParaDrive(caminhoLocal, caminhoDestinoNoDrive) {
  return new Promise((resolve, reject) => {
    const comando = `rclone copyto "${caminhoLocal}" "gdrive:${caminhoDestinoNoDrive}" -v`
    exec(comando, (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Erro ao enviar para o Drive:', stderr)
        return reject(err)
      }
      console.log(`✅ Enviado para o Drive: gdrive:${caminhoDestinoNoDrive}`)
      resolve()
    })
  })
}

/**
 * Obtém o ID do arquivo no Drive com base no nome do arquivo dentro de uma pasta remota.
 * @param {string} remotePath - Caminho remoto da pasta no Drive, ex: gdrive:NFCe/pdf/2025/04
 * @param {string} nomeArquivo - Nome do arquivo a ser procurado, ex: nfce_1234567890.pdf
 * @returns {Promise<string>} - Retorna o ID do arquivo se encontrado.
 */
function obterIdArquivo(remotePath, nomeArquivo) {
  return new Promise((resolve, reject) => {
    const comando = `rclone lsjson "${remotePath}"`
    exec(comando, (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Erro ao listar arquivos no Drive:', stderr)
        return reject(err)
      }

      try {
        const arquivos = JSON.parse(stdout)
        const encontrado = arquivos.find((f) => f.Name === nomeArquivo)

        if (!encontrado || !encontrado.ID) {
          return reject(new Error('Arquivo não encontrado ou ID ausente'))
        }

        resolve(encontrado.ID)
      } catch (parseError) {
        reject(parseError)
      }
    })
  })
}

/**
 * Gera o link público do Google Drive com base no ID do arquivo.
 * @param {string} idArquivo - ID do arquivo no Google Drive.
 * @returns {string} - URL acessível publicamente do arquivo.
 */
function gerarLinkDrive(idArquivo) {
  return `https://drive.google.com/file/d/${idArquivo}/view`
}

/**
 * Remove um arquivo do Google Drive usando Rclone.
 * @param {string} caminhoRemoto - Caminho completo no remote "gdrive", ex: NFCe/pdf/2025/04/nfce_1234567890.pdf ou NFe/pdf/2025/04/nfce_1234567890.pdf
 */
function removerDoDrive(caminhoRemoto) {
  return new Promise((resolve, reject) => {
    const comando = `rclone delete "gdrive:${caminhoRemoto}" -v`
    exec(comando, (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Erro ao remover do Drive:', stderr)
        return reject(err)
      }
      console.log(`🗑️ Removido do Drive: gdrive:${caminhoRemoto}`)
      resolve()
    })
  })
}

module.exports = {
  enviarParaDrive,
  obterIdArquivo,
  gerarLinkDrive,
  removerDoDrive,
}
