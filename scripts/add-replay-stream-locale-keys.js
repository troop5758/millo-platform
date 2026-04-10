'use strict';
const fs   = require('fs');
const path = require('path');
const dir  = path.join(__dirname, '..', 'packages', 'web', 'src', 'locales');

const additions = {
  es: {
    replay: {
      today:          'Hoy',
      yesterday:      'Ayer',
      daysAgo:        'Hace {{count}} días',
      weeksAgo:       'Hace {{count}} semanas',
      monthsAgo:      'Hace {{count}} meses',
      untitled:       'Reproducción',
      thisStream:     'este stream',
      creator:        'Creador',
      notAvailable:   'Esta reproducción ya no está disponible.',
      notFoundSeo:    'Reproducción no encontrada — Millo',
      seoTitle:       '{{title}} — {{creator}} — Millo',
      seoDesc:        'Mira la reproducción de {{title}} por {{creator}}.',
      creatorProfile: 'Perfil del creador',
      goBack:         'Volver',
      peakViewers:    '{{count}} espectadores pico',
      followers:      '{{count}} seguidores',
      viewProfile:    'Ver perfil',
      moreFrom:       'Más de {{creator}}',
      noOtherReplays: 'Aún no hay otras reproducciones.',
      allReplays:     'Todas las reproducciones →',
    },
    streamPlayer: {
      noStreamId:  'No se proporcionó ID de stream.',
      notFound:    'Stream no encontrado o ya no disponible.',
      notFoundSeo: 'Stream no encontrado — Millo',
      seoTitle:    '{{title}} — {{creator}} — Millo',
      seoDesc:     'Mira {{creator}} en vivo en Millo.',
    },
  },
  fr: {
    replay: {
      today:          "Aujourd'hui",
      yesterday:      'Hier',
      daysAgo:        'Il y a {{count}} jours',
      weeksAgo:       'Il y a {{count}} semaines',
      monthsAgo:      'Il y a {{count}} mois',
      untitled:       'Rediffusion',
      thisStream:     'ce stream',
      creator:        'Créateur',
      notAvailable:   "Cette rediffusion n'est plus disponible.",
      notFoundSeo:    'Rediffusion introuvable — Millo',
      seoTitle:       '{{title}} — {{creator}} — Millo',
      seoDesc:        'Regardez la rediffusion de {{title}} par {{creator}}.',
      creatorProfile: 'Profil du créateur',
      goBack:         'Retour',
      peakViewers:    '{{count}} spectateurs maximum',
      followers:      '{{count}} abonnés',
      viewProfile:    'Voir le profil',
      moreFrom:       'Plus de {{creator}}',
      noOtherReplays: "Pas encore d'autres rediffusions.",
      allReplays:     'Toutes les rediffusions →',
    },
    streamPlayer: {
      noStreamId:  "Aucun identifiant de stream fourni.",
      notFound:    "Stream introuvable ou plus disponible.",
      notFoundSeo: 'Stream introuvable — Millo',
      seoTitle:    '{{title}} — {{creator}} — Millo',
      seoDesc:     'Regardez {{creator}} en direct sur Millo.',
    },
  },
  pt: {
    replay: {
      today:          'Hoje',
      yesterday:      'Ontem',
      daysAgo:        'Há {{count}} dias',
      weeksAgo:       'Há {{count}} semanas',
      monthsAgo:      'Há {{count}} meses',
      untitled:       'Replay',
      thisStream:     'este stream',
      creator:        'Criador',
      notAvailable:   'Este replay não está mais disponível.',
      notFoundSeo:    'Replay não encontrado — Millo',
      seoTitle:       '{{title}} — {{creator}} — Millo',
      seoDesc:        'Assista ao replay de {{title}} por {{creator}}.',
      creatorProfile: 'Perfil do criador',
      goBack:         'Voltar',
      peakViewers:    '{{count}} espectadores no pico',
      followers:      '{{count}} seguidores',
      viewProfile:    'Ver perfil',
      moreFrom:       'Mais de {{creator}}',
      noOtherReplays: 'Ainda não há outros replays.',
      allReplays:     'Todos os replays →',
    },
    streamPlayer: {
      noStreamId:  'Nenhum ID de stream fornecido.',
      notFound:    'Stream não encontrado ou não está mais disponível.',
      notFoundSeo: 'Stream não encontrado — Millo',
      seoTitle:    '{{title}} — {{creator}} — Millo',
      seoDesc:     'Assista {{creator}} ao vivo na Millo.',
    },
  },
  ar: {
    replay: {
      today:          'اليوم',
      yesterday:      'أمس',
      daysAgo:        'منذ {{count}} أيام',
      weeksAgo:       'منذ {{count}} أسابيع',
      monthsAgo:      'منذ {{count}} أشهر',
      untitled:       'إعادة تشغيل',
      thisStream:     'هذا البث',
      creator:        'المبدع',
      notAvailable:   'لم يعد هذا التسجيل متاحًا.',
      notFoundSeo:    'التسجيل غير موجود — Millo',
      seoTitle:       '{{title}} — {{creator}} — Millo',
      seoDesc:        'شاهد إعادة تشغيل {{title}} بواسطة {{creator}}.',
      creatorProfile: 'ملف المبدع',
      goBack:         'العودة',
      peakViewers:    '{{count}} مشاهدًا في الذروة',
      followers:      '{{count}} متابع',
      viewProfile:    'عرض الملف الشخصي',
      moreFrom:       'المزيد من {{creator}}',
      noOtherReplays: 'لا توجد إعادات أخرى بعد.',
      allReplays:     'كل الإعادات →',
    },
    streamPlayer: {
      noStreamId:  'لم يتم تقديم معرّف البث.',
      notFound:    'البث غير موجود أو لم يعد متاحًا.',
      notFoundSeo: 'البث غير موجود — Millo',
      seoTitle:    '{{title}} — {{creator}} — Millo',
      seoDesc:     'شاهد {{creator}} مباشرةً على Millo.',
    },
  },
};

for (const [lang, namespaces] of Object.entries(additions)) {
  const file = path.join(dir, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [ns, keys] of Object.entries(namespaces)) {
    data[ns] = keys;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Updated ${lang}.json — added namespaces: ${Object.keys(namespaces).join(', ')}`);
}
console.log('Done.');
