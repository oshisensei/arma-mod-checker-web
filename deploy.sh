#!/bin/bash

echo "🚀 Déploiement sur Vercel..."

# Vérifier que Vercel CLI est installé
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI n'est pas installé. Installation..."
    npm install -g vercel
fi

# Déployer
echo "📦 Déploiement en cours..."
vercel --prod --yes

echo "✅ Déploiement terminé !" 