<?php
/**
 * API key generator and masking utilities for entities.
 */

declare(strict_types=1);

/**
 * Generate a unique API key with the frag_ prefix and 48 random hex characters.
 */
function generate_api_key(): string
{
    $bytes = random_bytes(24);
    return 'frag_' . bin2hex($bytes);
}

/**
 * Return a masked version of an API key for safe public display.
 */
function mask_api_key(string $key): string
{
    $length = strlen($key);
    if ($length <= 12) {
        return 'frag_****';
    }

    return substr($key, 0, 9) . '...' . substr($key, -4);
}
