(function() {
    // 1. Se estiver rodando dentro de um Iframe (app filho), pega o Supabase do Pai
    if (window !== window.parent && window.parent.supabaseClient) {
        window.supabaseClient = window.parent.supabaseClient;
        return; // Interrompe aqui, não cria uma nova conexão
    }

    // 2. Se for a janela principal (app Pai), cria a instância única
    if (!window.supabaseClient) {
        const supabaseUrl = 'https://whnzeysvqbtuecxmthht.supabase.co';
        const supabaseKey = 'sb_publishable_Gw4cFK56R9kms2ogg50UqA_ZhHi79qw';
        
        window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
})();