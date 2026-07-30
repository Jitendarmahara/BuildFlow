#!/bin/sh

set -e

echo "preview-build: waiting for /workspace/package.json"
while [ ! -f /workspace/package.json ] ; do
    sleep 1
done

echo "preview-build: installing app deps..."
bun install

echo "preview-build: starting vite on 0.0.0.0:5137"
exec bunx vite --host 0.0.0.0 --port 5173    #this exec reomve the shell as parent of the vite process when the kubernates want to stop it dircleyt talk to the vite process
