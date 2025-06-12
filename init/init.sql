CREATE DATABASE IF NOT EXISTS fmjoias2;
USE fmjoias2;

SET FOREIGN_KEY_CHECKS = 0;

-- =================================================================
-- 1. TABELAS PRINCIPAIS (PAIS)
--    Tabelas que não dependem de outras ou são a base para muitas outras.
-- =================================================================

CREATE TABLE IF NOT EXISTS `vendedores` (
  `nome` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome_unico` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpf` varchar(11) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rotas` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `idVendedor` int NOT NULL AUTO_INCREMENT,
  `status` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`cpf`),
  UNIQUE KEY `idVendedor` (`idVendedor`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kits` (
  `sku` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` int NOT NULL,
  `produtos` json DEFAULT NULL,
  PRIMARY KEY (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `produtos` (
  `sku` varchar(20) NOT NULL,
  `descricao` varchar(30) DEFAULT NULL,
  `valor` int DEFAULT NULL,
  `estoque` int DEFAULT NULL,
  PRIMARY KEY (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =================================================================
-- 2. TABELAS DEPENDENTES (FILHAS) E DE TRANSAÇÕES
--    Tabelas que possuem chaves estrangeiras.
-- =================================================================

CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomeCliente` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cpf` varchar(14) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `endTipo` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `endereco` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `numero` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bairro` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pontoRef` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('CE','RN','PI','MA','PB') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cidade` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nomeMae` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dataNascimento` date DEFAULT NULL,
  `rota` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `idVendedor` int DEFAULT NULL,
  `data_cadastro` date DEFAULT NULL,
  `latitude` decimal(9,6) DEFAULT NULL,
  `longitude` decimal(9,6) DEFAULT NULL,
  `status` tinyint(1) DEFAULT '0',
  `pendencia` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_vendedor` (`idVendedor`),
  KEY `cpf` (`cpf`),
  CONSTRAINT `fk_vendedor` FOREIGN KEY (`idVendedor`) REFERENCES `vendedores` (`idVendedor`)
) ENGINE=InnoDB AUTO_INCREMENT=45778 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clientes_nome_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente_id` int NOT NULL,
  `nome_anterior` varchar(255) NOT NULL,
  `data_modificacao` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `cliente_id` (`cliente_id`),
  CONSTRAINT `clientes_nome_historico_ibfk_1` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=610 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `vendas` (
  `venda_id` int NOT NULL AUTO_INCREMENT,
  `tipo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kit` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id` int DEFAULT NULL,
  `vencimento` date DEFAULT NULL,
  `atualizacao` date DEFAULT NULL,
  `valor` int DEFAULT NULL,
  `valorRecebido` int DEFAULT NULL,
  `vb` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `situacao` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `idVendedor` int DEFAULT NULL,
  `status_venda` tinyint(1) DEFAULT '0',
  `permissao` tinyint(1) DEFAULT '0',
  `rota` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observacao` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`venda_id`),
  KEY `cliente_id` (`cliente_id`),
  KEY `fk_venda_vendedor` (`idVendedor`),
  KEY `kit` (`kit`),
  CONSTRAINT `fk_venda_vendedor` FOREIGN KEY (`idVendedor`) REFERENCES `vendedores` (`idVendedor`),
  CONSTRAINT `vendas_ibfk_1` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`),
  CONSTRAINT `vendas_ibfk_2` FOREIGN KEY (`kit`) REFERENCES `kits` (`sku`)
) ENGINE=InnoDB AUTO_INCREMENT=347288 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ocorrencias` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente_id` int NOT NULL,
  `venda_id` int NOT NULL,
  `vendedor_id` int NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `valor_recebido` decimal(10,2) NOT NULL,
  `restante_pendente` decimal(10,2) NOT NULL,
  `status_ocorrencia` enum('registrado','resolvido') DEFAULT 'registrado',
  `data_ocorrencia` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ocorrencias_cliente` (`cliente_id`),
  KEY `fk_ocorrencias_vendedor` (`vendedor_id`),
  KEY `fk_ocorrencias_venda` (`venda_id`),
  CONSTRAINT `fk_ocorrencias_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ocorrencias_venda` FOREIGN KEY (`venda_id`) REFERENCES `vendas` (`venda_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ocorrencias_vendedor` FOREIGN KEY (`vendedor_id`) REFERENCES `vendedores` (`idVendedor`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `controle_panos` (
  `idControle` int NOT NULL AUTO_INCREMENT,
  `idVendedor` int NOT NULL,
  `rota` varchar(20) NOT NULL,
  `spp` int DEFAULT '0',
  `spg` int DEFAULT '0',
  `pp` int DEFAULT '0',
  `pg` int DEFAULT '0',
  `pv` int DEFAULT '0',
  `vpp` int DEFAULT '0',
  `vpg` int DEFAULT '0',
  `valores` decimal(10,2) DEFAULT '0.00',
  `data_registro` date NOT NULL,
  `status_registro` tinyint NOT NULL,
  PRIMARY KEY (`idControle`),
  KEY `idVendedor` (`idVendedor`),
  CONSTRAINT `controle_panos_ibfk_1` FOREIGN KEY (`idVendedor`) REFERENCES `vendedores` (`idVendedor`),
  CONSTRAINT `chk_status_registro` CHECK ((`status_registro` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `netrin_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idVendedor` int NOT NULL,
  `cpf` varchar(14) NOT NULL,
  `nomeRetornado` varchar(255) NOT NULL,
  `data` datetime NOT NULL,
  `status` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_idVendedor` (`idVendedor`),
  CONSTRAINT `fk_idVendedor` FOREIGN KEY (`idVendedor`) REFERENCES `vendedores` (`idVendedor`)
) ENGINE=InnoDB AUTO_INCREMENT=3336 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `resultados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idVendedor` int NOT NULL,
  `rota` varchar(255) NOT NULL,
  `data` date NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `cobrancas` int NOT NULL,
  `media` decimal(5,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_vendedor_resultados` (`idVendedor`),
  CONSTRAINT `fk_vendedor_resultados` FOREIGN KEY (`idVendedor`) REFERENCES `vendedores` (`idVendedor`)
) ENGINE=InnoDB AUTO_INCREMENT=784 DEFAULT CHARSET=utf8mb3;

CREATE TABLE IF NOT EXISTS `visita_restantes` (
  `idVisita` int NOT NULL AUTO_INCREMENT,
  `idVendedor` int NOT NULL,
  `clienteId` int NOT NULL,
  `dataVisita` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `motivo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(9,6) DEFAULT NULL,
  `longitude` decimal(9,6) DEFAULT NULL,
  PRIMARY KEY (`idVisita`),
  KEY `idVendedor` (`idVendedor`),
  KEY `clienteId` (`clienteId`),
  CONSTRAINT `visita_restantes_ibfk_1` FOREIGN KEY (`idVendedor`) REFERENCES `vendedores` (`idVendedor`),
  CONSTRAINT `visita_restantes_ibfk_2` FOREIGN KEY (`clienteId`) REFERENCES `clientes` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=71 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =================================================================
-- 3. TABELAS DE LOG, HISTÓRICO E OUTRAS (SEM FKs FORTES)
--    Tabelas que não possuem dependências de criação e podem ser criadas por último.
-- =================================================================

CREATE TABLE IF NOT EXISTS `clientes_alteracoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente_id` int NOT NULL,
  `campo_alterado` varchar(100) NOT NULL,
  `valor_anterior` text,
  `valor_novo` text,
  `data_alteracao` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `cliente_id` (`cliente_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7017 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `controle_panos_log` (
  `idLog` int NOT NULL AUTO_INCREMENT,
  `operacao` enum('INSERT','UPDATE','DELETE') NOT NULL,
  `idControle` int DEFAULT NULL,
  `idVendedor` int DEFAULT NULL,
  `rota` varchar(20) DEFAULT NULL,
  `spp` int DEFAULT NULL,
  `spg` int DEFAULT NULL,
  `pp` int DEFAULT NULL,
  `pg` int DEFAULT NULL,
  `pv` int DEFAULT NULL,
  `vpp` int DEFAULT NULL,
  `vpg` int DEFAULT NULL,
  `valores` decimal(10,2) DEFAULT NULL,
  `data_registro` date DEFAULT NULL,
  `status_registro` tinyint DEFAULT NULL,
  `data_ocorrencia` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idLog`)
) ENGINE=InnoDB AUTO_INCREMENT=52 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `destinatarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cpf` varchar(11) DEFAULT NULL,
  `cnpj` varchar(14) DEFAULT NULL,
  `nome` varchar(60) NOT NULL,
  `logradouro` varchar(60) DEFAULT NULL,
  `numero` varchar(20) DEFAULT NULL,
  `bairro` varchar(60) DEFAULT NULL,
  `municipio` varchar(60) DEFAULT NULL,
  `codigo_municipio` int DEFAULT NULL,
  `uf` char(2) DEFAULT NULL,
  `cep` varchar(8) DEFAULT NULL,
  `telefone` varchar(14) DEFAULT NULL,
  `indicador_ie` char(1) DEFAULT NULL,
  `inscricao_estadual` varchar(14) DEFAULT NULL,
  `email` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `un_cpf` (`cpf`),
  UNIQUE KEY `un_cnpj` (`cnpj`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `destinatarios_retorno` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cpf` varchar(11) DEFAULT NULL,
  `cnpj` varchar(14) DEFAULT NULL,
  `nome` varchar(60) NOT NULL,
  `logradouro` varchar(60) DEFAULT NULL,
  `numero` varchar(20) DEFAULT NULL,
  `bairro` varchar(60) DEFAULT NULL,
  `municipio` varchar(60) DEFAULT NULL,
  `codigo_municipio` int DEFAULT NULL,
  `uf` char(2) DEFAULT NULL,
  `cep` varchar(8) DEFAULT NULL,
  `telefone` varchar(14) DEFAULT NULL,
  `indicador_ie` char(1) DEFAULT NULL,
  `inscricao_estadual` varchar(14) DEFAULT NULL,
  `email` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`),
  UNIQUE KEY `cnpj` (`cnpj`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `envios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idVendedor` int NOT NULL,
  `rota` varchar(30) NOT NULL,
  `data_envio` date NOT NULL,
  `panos` int NOT NULL,
  `fichas` int NOT NULL,
  `valor` float NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=324 DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `equipe` (
  `idVendedor` int NOT NULL,
  `ids` json DEFAULT NULL,
  PRIMARY KEY (`idVendedor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `frases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `frase` varchar(250) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `naturezas_operacao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `descricao` varchar(100) NOT NULL,
  `natureza_operacao` varchar(100) NOT NULL,
  `cfop` varchar(4) NOT NULL,
  `tipo_documento` char(1) NOT NULL,
  `finalidade_emissao` char(1) DEFAULT '1',
  `local_destino` char(1) DEFAULT '1',
  `presenca_comprador` char(1) DEFAULT '9',
  `consumidor_final` char(1) DEFAULT '1',
  `modalidade_frete` char(1) DEFAULT '9',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `netrin` (
  `token` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfce_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ref` varchar(50) NOT NULL,
  `status` varchar(50) DEFAULT NULL,
  `status_sefaz` varchar(10) DEFAULT NULL,
  `mensagem_sefaz` text,
  `chave_nfe` varchar(60) DEFAULT NULL,
  `numero` varchar(10) DEFAULT NULL,
  `serie` varchar(10) DEFAULT NULL,
  `cnpj_emitente` varchar(20) DEFAULT NULL,
  `nome_destinatario` varchar(100) DEFAULT NULL,
  `cpf_destinatario` varchar(14) DEFAULT NULL,
  `valor_total` decimal(10,2) DEFAULT NULL,
  `caminho_xml_nota_fiscal` text,
  `caminho_danfe` text,
  `link_danfe_drive` text,
  `caminho_xml_cancelamento` text,
  `motivo_cancelamento` text,
  `numero_protocolo` varchar(50) DEFAULT NULL,
  `data_emissao` datetime DEFAULT NULL,
  `contingencia_offline` tinyint(1) DEFAULT '0',
  `contingencia_efetivada` tinyint(1) DEFAULT '0',
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ref` (`ref`)
) ENGINE=InnoDB AUTO_INCREMENT=86 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfce_historico_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nfce_id` int DEFAULT NULL,
  `ref` varchar(50) DEFAULT NULL,
  `campo_modificado` varchar(50) DEFAULT NULL,
  `valor_antigo` text,
  `valor_novo` text,
  `data_alteracao` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfce_inutilizadas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cnpj` varchar(20) NOT NULL,
  `modelo` varchar(5) DEFAULT '65',
  `serie` varchar(10) NOT NULL,
  `numero_inicial` varchar(10) NOT NULL,
  `numero_final` varchar(10) NOT NULL,
  `protocolo_sefaz` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `status_sefaz` varchar(10) DEFAULT NULL,
  `mensagem_sefaz` text,
  `caminho_xml` text,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `data_inutilizacao` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfce_tributos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modalidade_frete` varchar(2) NOT NULL,
  `local_destino` varchar(2) NOT NULL,
  `presenca_comprador` varchar(2) NOT NULL,
  `codigo_ncm` varchar(10) NOT NULL,
  `cfop` varchar(10) NOT NULL,
  `icms_origem` varchar(2) NOT NULL,
  `icms_situacao_tributaria` varchar(4) NOT NULL,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfe_detalhes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `numero_nf` varchar(20) NOT NULL,
  `chave_acesso` varchar(44) DEFAULT NULL,
  `nfe_data` json NOT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfe_emitente` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cnpj_emitente` varchar(14) NOT NULL,
  `nome_emitente` varchar(100) NOT NULL,
  `nome_fantasia_emitente` varchar(100) NOT NULL,
  `logradouro_emitente` varchar(100) NOT NULL,
  `numero_emitente` varchar(10) DEFAULT NULL,
  `complemento_emitente` varchar(100) DEFAULT NULL,
  `bairro_emitente` varchar(50) NOT NULL,
  `codigo_municipio_emitente` int NOT NULL,
  `municipio_emitente` varchar(50) NOT NULL,
  `uf_emitente` varchar(2) NOT NULL,
  `cep_emitente` varchar(8) NOT NULL,
  `telefone_emitente` varchar(14) DEFAULT NULL,
  `inscricao_estadual_emitente` varchar(30) NOT NULL,
  `regime_tributario_emitente` varchar(10) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cnpj_emitente` (`cnpj_emitente`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfe_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome_destinatario` varchar(255) DEFAULT NULL,
  `ref` varchar(50) NOT NULL,
  `status` varchar(50) DEFAULT NULL,
  `status_sefaz` varchar(10) DEFAULT NULL,
  `mensagem_sefaz` varchar(255) DEFAULT NULL,
  `chave_nfe` varchar(60) DEFAULT NULL,
  `numero` int DEFAULT NULL,
  `serie` int DEFAULT NULL,
  `cnpj_emitente` varchar(20) DEFAULT NULL,
  `caminho_xml_nota_fiscal` text,
  `caminho_danfe` text,
  `link_danfe_drive` text,
  `caminho_xml_cancelamento` text,
  `caminho_xml_carta_correcao` text,
  `caminho_pdf_carta_correcao` text,
  `link_carta_correcao_drive` text,
  `numero_carta_correcao` int DEFAULT NULL,
  `data_emissao` datetime DEFAULT NULL,
  `data_criacao` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ref` (`ref`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfe_inutilizadas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ref` varchar(100) NOT NULL,
  `serie` int NOT NULL,
  `numero_inicial` int NOT NULL,
  `numero_final` int NOT NULL,
  `justificativa` text,
  `status` varchar(50) DEFAULT NULL,
  `status_sefaz` varchar(10) DEFAULT NULL,
  `mensagem_sefaz` text,
  `chave_autorizacao` varchar(255) DEFAULT NULL,
  `cnpj_emitente` varchar(20) DEFAULT NULL,
  `data_inutilizacao` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `nfe_itens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `numero_nf` varchar(20) NOT NULL,
  `itens` json NOT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `produtos_fiscais` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo_produto` varchar(60) NOT NULL,
  `descricao` varchar(120) NOT NULL,
  `codigo_ncm` varchar(8) NOT NULL,
  `cfop` varchar(4) NOT NULL,
  `unidade_comercial` varchar(6) NOT NULL DEFAULT 'un',
  `icms_origem` char(1) NOT NULL DEFAULT '0',
  `icms_situacao_tributaria` varchar(4) NOT NULL DEFAULT '400',
  `pis_situacao_tributaria` varchar(4) NOT NULL DEFAULT '99',
  `cofins_situacao_tributaria` varchar(4) NOT NULL DEFAULT '99',
  `valor_unitario` decimal(13,2) NOT NULL,
  `possui_gtin` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `produtos_fiscais_nfc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo_produto` varchar(60) NOT NULL,
  `descricao` varchar(120) NOT NULL,
  `codigo_ncm` varchar(8) NOT NULL,
  `cfop` varchar(4) NOT NULL,
  `unidade_comercial` varchar(6) NOT NULL DEFAULT 'un',
  `icms_origem` char(1) NOT NULL DEFAULT '0',
  `icms_situacao_tributaria` varchar(4) NOT NULL DEFAULT '102',
  `pis_situacao_tributaria` varchar(4) NOT NULL DEFAULT '99',
  `cofins_situacao_tributaria` varchar(4) NOT NULL DEFAULT '99',
  `valor_unitario` decimal(13,2) NOT NULL,
  `possui_gtin` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `responsaveis_tecnicos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cnpj_responsavel_tecnico` varchar(14) DEFAULT NULL,
  `contato_responsavel_tecnico` varchar(50) NOT NULL,
  `email_responsavel_tecnico` varchar(50) DEFAULT NULL,
  `telefone_responsavel_tecnico` varchar(14) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cnpj_responsavel_tecnico` (`cnpj_responsavel_tecnico`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fullName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cpf` varchar(11) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `idVendedor` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users_adm` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `nome_unico` varchar(50) DEFAULT NULL,
  `cpf` varchar(14) NOT NULL,
  `cargo` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `users_adm_autorizados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomeCompleto` varchar(255) NOT NULL,
  `cpf` varchar(14) DEFAULT NULL,
  `cargo` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `vendas_alteracoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `venda_id` int NOT NULL,
  `campo_alterado` varchar(100) NOT NULL,
  `valor_anterior` text,
  `valor_novo` text,
  `data_alteracao` datetime DEFAULT CURRENT_TIMESTAMP,
  `cliente_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `venda_id` (`venda_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17544 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;