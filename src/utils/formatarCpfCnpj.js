function formatarCPF(cpf) {
  // Remove tudo que não for número
  cpf = cpf.replace(/\D/g, '')

  // Aplica a máscara se o CPF tiver 11 dígitos
  if (cpf.length === 11) {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  // Retorna sem formatação se for inválido
  return cpf
}

function formatarCNPJ(cnpj) {
  // Remove tudo que não for número
  cnpj = cnpj.replace(/\D/g, '')

  // Aplica a máscara se o CNPJ tiver 14 dígitos
  if (cnpj.length === 14) {
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }

  // Retorna sem formatação se for inválido
  return cnpj
}

module.exports = {
  formatarCPF,
  formatarCNPJ,
}
