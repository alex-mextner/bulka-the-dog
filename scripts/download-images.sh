#!/bin/bash
set -e
cd "$(dirname "$0")/.."
mkdir -p public/images
cd public/images

base="https://cdn.builder.io/api/v1/image/assets%2F349256541d1341939e72d696071cd0ab%2F"

declare -a names=(
  "health1:ebe081f5d802478d89617400572093e4"
  "health2:a244d2443be4415d9888eea1cd496cd7"
  "dogs_public:94d2a5cd4a9343468b23dde87cfcd8a8"
  "lena_dogs:7077bb27222143f29bc9c2dbd5149d58"
  "dog_car:c2c3eed2b76c40808c2af7de062fdc63"
  "dog_home:925731d3575142aeaf9e8435f62050f1"
  "dog_vet:b222c688f26b4823bd38803cb3ced601"
  "dog_apartment:b3df19060f194e8b8ff85ecffe8febe3"
  "dog_vet2:4e39f271bcb4455e8f51105960493e24"
  "person_dog:0478849b4a5440ea8690fcb045a610bf"
)

for entry in "${names[@]}"; do
  name="${entry%%:*}"
  hash="${entry##*:}"
  echo "downloading $name"
  timeout 30 curl -sSL -o "$name.webp" "${base}${hash}?format=webp&width=1600" || echo "FAILED $name"
done
ls -la
