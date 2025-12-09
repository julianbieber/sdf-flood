set shell := ["bash", "-uc"]

# Default recipe that shows help
default:
    @just --list

# Build the project
build:
    cargo build --release

# Run the project with release optimizations
run:
    cargo run --release

# Show help for the project
help:
    cargo run --release -- --help

# List all shader files in the shaders directory
list-shaders:
    @echo "Available shaders:"
    @ls -la shaders/ 2>/dev/null || echo "No shaders directory found"

# Run with a specific shader file
run-shader SHADER_PATH:
    cargo run --release -- --shader-path {{SHADER_PATH}}


# Clean build artifacts
clean:
    cargo clean

# Format code
fmt:
    cargo fmt

# Check code without building
check:
    cargo check

# Run clippy linter
clippy:
    cargo clippy

new-shader name:
    #!/usr/bin/env bash
    set -euo pipefail
    src="./shaders/empty.frag"
    dst="./shaders/{{name}}.frag"
    test -e "$dst" || cp "$src" "$dst"


# Show project information
info:
    @echo "Project: $(basename $(pwd))"
    @echo "Rust version: $(rustc --version)"
    @echo "Cargo version: $(cargo --version)"
