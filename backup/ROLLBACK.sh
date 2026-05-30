#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ROLLBACK — Откат к состоянию перед микросервисным разбиением
# Дата бэкапа: 2026-05-28
# Строк кода: 7 896 (14 файлов)
# ═══════════════════════════════════════════════════════════════

set -e

BACKUP_DIR="/home/z/my-project/backup/pre-microservice-split-2026-05-28"
PUBLIC_JS="/home/z/my-project/public/js"
PAYROLL_DIR="$PUBLIC_JS/payroll"
DOCS_DIR="/home/z/my-project/docs"

echo "⚠️  ROLLBACK: Восстановление состояния от 2026-05-28"
echo "   Бэкап: $BACKUP_DIR"
echo ""

# Проверяем что бэкап существует
if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Бэкап не найден: $BACKUP_DIR"
  exit 1
fi

# Подсчёт файлов в бэкапе
COUNT=$(ls -1 "$BACKUP_DIR"/*.js "$BACKUP_DIR"/*.md 2>/dev/null | wc -l)
echo "   Файлов в бэкапе: $COUNT"
echo ""

# Подтверждение
read -p "Продолжить откат? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Отменено."
  exit 0
fi

echo ""
echo "🔄 Восстановление..."

# Корневые JS файлы
cp -v "$BACKUP_DIR/tab-payroll-review.js" "$PUBLIC_JS/"
cp -v "$BACKUP_DIR/payroll-review-styles.js" "$PUBLIC_JS/"
cp -v "$BACKUP_DIR/payroll-review-calc.js" "$PUBLIC_JS/"
cp -v "$BACKUP_DIR/payroll-review-storage.js" "$PUBLIC_JS/"
cp -v "$BACKUP_DIR/payroll-review-export.js" "$PUBLIC_JS/"
cp -v "$BACKUP_DIR/core.js" "$PUBLIC_JS/"
cp -v "$BACKUP_DIR/data-loader.js" "$PUBLIC_JS/"

# Payroll engine
mkdir -p "$PAYROLL_DIR"
cp -v "$BACKUP_DIR/payroll-domain.js" "$PAYROLL_DIR/"
cp -v "$BACKUP_DIR/payroll-storage.js" "$PAYROLL_DIR/"
cp -v "$BACKUP_DIR/payroll-projection.js" "$PAYROLL_DIR/"
cp -v "$BACKUP_DIR/payroll-export.js" "$PAYROLL_DIR/"
cp -v "$BACKUP_DIR/payroll-review-engine.js" "$PAYROLL_DIR/"
cp -v "$BACKUP_DIR/payroll-normalizer.js" "$PAYROLL_DIR/"
cp -v "$BACKUP_DIR/payroll-cache.js" "$PAYROLL_DIR/"

# BRAIN
cp -v "$BACKUP_DIR/PROJECT_BRAIN.md" "$DOCS_DIR/"

# Удаляем новые файлы микросервисов (которых не было в бэкапе)
echo ""
echo "🧹 Удаление новых файлов микросервисов..."
rm -fv "$PUBLIC_JS/pr-bus.js" 2>/dev/null || true
rm -fv "$PUBLIC_JS/pr-admin.js" 2>/dev/null || true
rm -fv "$PUBLIC_JS/pr-timeline.js" 2>/dev/null || true
rm -fv "$PUBLIC_JS/pr-export.js" 2>/dev/null || true
rm -fv "$PUBLIC_JS/pr-header.js" 2>/dev/null || true
rm -fv "$PUBLIC_JS/pr-review.js" 2>/dev/null || true
rm -fv "$PUBLIC_JS/pr-cards.js" 2>/dev/null || true

echo ""
echo "✅ Откат завершён. Состояние: 2026-05-28 (перед разбиением)"
echo "   Перезагрузите страницу Bitrix24 для применения."
