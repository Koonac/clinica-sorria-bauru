<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ServePublicStorage
{
    public function handle(string $path): BinaryFileResponse
    {
        $normalized = $this->normalizedPath($path);
        $disk = Storage::disk('public');

        if ($normalized === '' || ! $disk->exists($normalized)) {
            throw new NotFoundHttpException();
        }

        $absolute = $disk->path($normalized);
        if (! is_file($absolute) || ! $this->isInsideDisk($disk->path(''), $absolute)) {
            throw new NotFoundHttpException();
        }

        return response()->file($absolute, [
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    private function normalizedPath(string $path): string
    {
        $normalized = str_replace('\\', '/', $path);
        $normalized = rawurldecode($normalized);
        $normalized = ltrim($normalized, '/');

        if ($normalized === '' || str_contains($normalized, "\0")) {
            return '';
        }

        foreach (explode('/', $normalized) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                return '';
            }
        }

        return $normalized;
    }

    private function isInsideDisk(string $root, string $absolute): bool
    {
        $realRoot = realpath($root);
        $realFile = realpath($absolute);

        if ($realRoot === false || $realFile === false) {
            return false;
        }

        $rootPath = strtolower(rtrim(str_replace('\\', '/', $realRoot), '/'));
        $filePath = strtolower(str_replace('\\', '/', $realFile));

        return $filePath === $rootPath || str_starts_with($filePath, $rootPath.'/');
    }
}
