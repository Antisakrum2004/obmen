#!/bin/bash
# Deploy script for payroll-review to Vercel
# Run this script after installing Vercel CLI: npm i -g vercel

echo "Deploying payroll-review to Vercel..."

# Login to Vercel (if not already logged in)
vercel login

# Deploy to production
vercel --prod --yes

echo "Done! Check the deployment URL."
