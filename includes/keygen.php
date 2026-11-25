<?php
declare(strict_types=1);

/**
 * Generate a cryptographically random RFC 4122 version 4 UUID.
 */
function generate_uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function generate_api_key(): string
{
    $bytes = random_bytes(24);
    return 'frag_' . bin2hex($bytes);
}

function mask_api_key(string $key): string
{
    $length = strlen($key);
    if ($length <= 12) {
        return 'frag_****';
    }

    return substr($key, 0, 9) . '...' . substr($key, -4);
}
