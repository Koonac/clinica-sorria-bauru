<?php

namespace App\Http\Controllers;

use App\Services\ServePublicStorage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class PublicStorageController extends Controller
{
    public function show(string $path, ServePublicStorage $serve): BinaryFileResponse
    {
        return $serve->handle($path);
    }
}
