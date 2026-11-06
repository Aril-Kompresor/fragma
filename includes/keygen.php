<?php
declare(strict_types=1);

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
