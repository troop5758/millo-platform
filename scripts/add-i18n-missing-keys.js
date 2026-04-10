'use strict';
const fs   = require('fs');
const path = require('path');
const dir  = path.join(__dirname, '..', 'packages', 'web', 'src', 'locales');

const additions = {
  en: {
    feed: {
      seoTitle: 'For You — Millo',
      seoDesc:  'Discover live streams, videos, and creators on Millo.',
      noResults: 'No results for "{{query}}"',
    },
    checkout: {
      seoTitle: 'Checkout — Millo',
      seoDesc:  'Complete your Millo purchase securely.',
    },
    product: {
      productDetails: 'Product Details',
      darkMode:       'Dark Mode',
      creator:        'Creator',
    },
    auctions: {
      loginRequired: 'You must be logged in to bid.',
      minBid:        'Minimum bid is {{amount}}',
      bidTooLow:     'Bid too low — please enter a higher amount.',
      bidPlaced:     'Bid placed! You are the highest bidder at {{amount}}.',
      anonymous:     'Anonymous',
      currentBid:    'Current bid',
      startingAt:    'Starting at',
      ended:         'Ended',
    },
  },
  es: {
    feed: {
      seoTitle: 'Para ti — Millo',
      seoDesc:  'Descubre streams en vivo, videos y creadores en Millo.',
      noResults: 'Sin resultados para "{{query}}"',
    },
    checkout: {
      seoTitle: 'Pago — Millo',
      seoDesc:  'Completa tu compra en Millo de forma segura.',
    },
    product: {
      productDetails: 'Detalles del producto',
      darkMode:       'Modo oscuro',
      creator:        'Creador',
    },
    auctions: {
      loginRequired: 'Debes iniciar sesión para pujar.',
      minBid:        'Puja mínima: {{amount}}',
      bidTooLow:     'Puja demasiado baja — ingresa un monto mayor.',
      bidPlaced:     '¡Puja realizada! Eres el mejor postor a {{amount}}.',
      anonymous:     'Anónimo',
      currentBid:    'Puja actual',
      startingAt:    'Desde',
      ended:         'Finalizado',
    },
  },
  fr: {
    feed: {
      seoTitle: 'Pour toi — Millo',
      seoDesc:  'Découvre les streams en direct, les vidéos et les créateurs sur Millo.',
      noResults: 'Aucun résultat pour "{{query}}"',
    },
    checkout: {
      seoTitle: 'Paiement — Millo',
      seoDesc:  'Finalisez votre achat Millo en toute sécurité.',
    },
    product: {
      productDetails: 'Détails du produit',
      darkMode:       'Mode sombre',
      creator:        'Créateur',
    },
    auctions: {
      loginRequired: 'Vous devez être connecté pour enchérir.',
      minBid:        'Enchère minimale : {{amount}}',
      bidTooLow:     'Enchère trop basse — veuillez entrer un montant plus élevé.',
      bidPlaced:     'Enchère placée ! Vous êtes le plus offrant à {{amount}}.',
      anonymous:     'Anonyme',
      currentBid:    'Enchère actuelle',
      startingAt:    'À partir de',
      ended:         'Terminé',
    },
  },
  pt: {
    feed: {
      seoTitle: 'Para você — Millo',
      seoDesc:  'Descubra streams ao vivo, vídeos e criadores no Millo.',
      noResults: 'Nenhum resultado para "{{query}}"',
    },
    checkout: {
      seoTitle: 'Pagamento — Millo',
      seoDesc:  'Conclua sua compra no Millo com segurança.',
    },
    product: {
      productDetails: 'Detalhes do produto',
      darkMode:       'Modo escuro',
      creator:        'Criador',
    },
    auctions: {
      loginRequired: 'Você precisa estar logado para dar um lance.',
      minBid:        'Lance mínimo: {{amount}}',
      bidTooLow:     'Lance muito baixo — insira um valor maior.',
      bidPlaced:     'Lance realizado! Você é o maior licitante em {{amount}}.',
      anonymous:     'Anônimo',
      currentBid:    'Lance atual',
      startingAt:    'A partir de',
      ended:         'Encerrado',
    },
  },
  ar: {
    feed: {
      seoTitle: 'لك — Millo',
      seoDesc:  'اكتشف البثوث المباشرة والمقاطع والمبدعين على Millo.',
      noResults: 'لا توجد نتائج لـ "{{query}}"',
    },
    checkout: {
      seoTitle: 'الدفع — Millo',
      seoDesc:  'أتمّ عملية الشراء على Millo بأمان.',
    },
    product: {
      productDetails: 'تفاصيل المنتج',
      darkMode:       'الوضع الداكن',
      creator:        'المبدع',
    },
    auctions: {
      loginRequired: 'يجب تسجيل الدخول للمزايدة.',
      minBid:        'أدنى مزايدة: {{amount}}',
      bidTooLow:     'المزايدة منخفضة جدًا — أدخل مبلغًا أعلى.',
      bidPlaced:     'تمّت المزايدة! أنت أعلى مزايد بـ {{amount}}.',
      anonymous:     'مجهول',
      currentBid:    'المزايدة الحالية',
      startingAt:    'يبدأ من',
      ended:         'انتهى',
    },
  },
};

for (const [lang, namespaces] of Object.entries(additions)) {
  const file = path.join(dir, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [ns, keys] of Object.entries(namespaces)) {
    data[ns] = Object.assign(data[ns] || {}, keys);
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Updated ${lang}.json`);
}
console.log('Done.');
