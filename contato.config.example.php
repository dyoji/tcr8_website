<?php
/**
 * Modelo da configuração do formulário de contato.
 *
 * Copie para FORA da pasta pública do site, um nível acima dela, com o nome config-contato-tcr8.php
 * e preencha os dados da conta que envia os e-mails. Esse arquivo real nunca deve ir para o git.
 *
 * Os valores abaixo usam a conta de envio que já existe na Mikami Hub (Hostinger); se o site
 * passar a ter um e-mail próprio da tCr8, é só trocar aqui.
 */
return [
    'smtp' => [
        'host' => 'smtp.hostinger.com',
        'port' => 465,
        'secure' => 'ssl', // 'ssl' (porta 465), 'tls' (STARTTLS, porta 587) ou '' (sem criptografia, só para testes locais)
        'user' => 'nao-responda@mikamihub.com',
        'pass' => 'COLOQUE_A_SENHA_AQUI',
    ],
    'from' => 'nao-responda@mikamihub.com',
    'from_name' => 'Site tCr8',
    'to' => 'contato@mikamihub.com', // caixa que recebe as mensagens do site
];
