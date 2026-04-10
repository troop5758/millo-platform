'use strict';
const fs   = require('fs');
const path = require('path');
const dir  = path.join(__dirname, '..', 'packages', 'web', 'src', 'locales');

const additions = {
  es: {
    payoutNote:       'Mínimo $5 · Procesado en 1-3 días hábiles',
    noSubs:           'Sin suscripciones activas.',
    revenueLast30d:   'Ingresos — últimos 30 días',
    statusCol:        'Estado',
    cancelSubErr:     'No se pudo cancelar la suscripción.',
    payoutRequested:  'Retiro de ${{amount}} solicitado! Nuevo saldo: ${{balance}}',
    viewPublicPage:   'Ver página pública',
    fieldDisplayName: 'Nombre de visualización',
    fieldUsername:    'Usuario',
    fieldBio:         'Biografía',
    fieldBioPlaceholder: 'Cuéntale a la gente sobre ti…',
    fieldAvatarUrl:   'URL del avatar',
    loadError:        'No se pudieron cargar algunos datos del perfil. Actualiza para intentarlo de nuevo.',
    seoTitle:         'Mi perfil',
    seoDesc:          'Gestiona tu perfil de creador, analíticas, billetera y suscripciones en Millo.',
  },
  fr: {
    payoutNote:       'Minimum 5$ · Traité sous 1 à 3 jours ouvrables',
    noSubs:           'Aucun abonnement actif.',
    revenueLast30d:   'Revenus — 30 derniers jours',
    statusCol:        'Statut',
    cancelSubErr:     "Impossible d'annuler l'abonnement.",
    payoutRequested:  'Retrait de ${{amount}} demandé ! Nouveau solde : ${{balance}}',
    viewPublicPage:   'Voir la page publique',
    fieldDisplayName: "Nom d'affichage",
    fieldUsername:    "Nom d'utilisateur",
    fieldBio:         'Biographie',
    fieldBioPlaceholder: 'Parlez-vous aux autres…',
    fieldAvatarUrl:   "URL de l'avatar",
    loadError:        "Certaines données du profil n'ont pas pu être chargées. Actualisez pour réessayer.",
    seoTitle:         'Mon profil',
    seoDesc:          'Gérez votre profil de créateur, analytiques, portefeuille et abonnements sur Millo.',
  },
  pt: {
    payoutNote:       'Mínimo $5 · Processado em 1-3 dias úteis',
    noSubs:           'Sem assinaturas ativas.',
    revenueLast30d:   'Receita — últimos 30 dias',
    statusCol:        'Status',
    cancelSubErr:     'Não foi possível cancelar a assinatura.',
    payoutRequested:  'Saque de ${{amount}} solicitado! Novo saldo: ${{balance}}',
    viewPublicPage:   'Ver página pública',
    fieldDisplayName: 'Nome de exibição',
    fieldUsername:    'Nome de usuário',
    fieldBio:         'Biografia',
    fieldBioPlaceholder: 'Conte às pessoas sobre você…',
    fieldAvatarUrl:   'URL do avatar',
    loadError:        'Alguns dados do perfil não puderam ser carregados. Atualize para tentar novamente.',
    seoTitle:         'Meu perfil',
    seoDesc:          'Gerencie seu perfil de criador, análises, carteira e assinaturas no Millo.',
  },
  ar: {
    payoutNote:       'الحد الأدنى $5 · يُعالج خلال 1-3 أيام عمل',
    noSubs:           'لا توجد اشتراكات نشطة.',
    revenueLast30d:   'الإيرادات — آخر 30 يومًا',
    statusCol:        'الحالة',
    cancelSubErr:     'تعذّر إلغاء الاشتراك.',
    payoutRequested:  'تم طلب سحب ${{amount}}! الرصيد الجديد: ${{balance}}',
    viewPublicPage:   'عرض الصفحة العامة',
    fieldDisplayName: 'اسم العرض',
    fieldUsername:    'اسم المستخدم',
    fieldBio:         'السيرة الذاتية',
    fieldBioPlaceholder: 'أخبر الناس عن نفسك…',
    fieldAvatarUrl:   'رابط الصورة الرمزية',
    loadError:        'تعذّر تحميل بعض بيانات الملف الشخصي. حدّث الصفحة للمحاولة مجددًا.',
    seoTitle:         'ملفي الشخصي',
    seoDesc:          'أدر ملفك الشخصي كمبدع، التحليلات، المحفظة والاشتراكات في Millo.',
  },
};

for (const [lang, keys] of Object.entries(additions)) {
  const file = path.join(dir, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(data.profilePage, keys);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Updated ${lang}.json — added ${Object.keys(keys).length} keys to profilePage`);
}
console.log('Done.');
