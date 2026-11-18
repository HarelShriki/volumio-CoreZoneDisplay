#!/bin/bash

echo "Installing CoreZoneDisplay plugin dependencies..."

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PLUGIN_DIR" || exit 1

npm install --production

echo "CoreZoneDisplay installation complete."
echo "plugininstallend"
