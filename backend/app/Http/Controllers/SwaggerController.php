<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class SwaggerController extends Controller
{
    public function ui(): Response
    {
        $title = e(config('swagger.title', 'API Docs'));
        $specUrl = e(url('/docs/swagger.json'));

        $html = <<<HTML
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{$title}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '{$specUrl}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>
HTML;

        return response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
    }

    public function json(): JsonResponse
    {
        $path = config('swagger.json_path');

        if (! is_string($path) || ! is_file($path)) {
            throw new NotFoundHttpException('Arquivo swagger.json não encontrado.');
        }

        $document = json_decode((string) file_get_contents($path), true);

        if (! is_array($document)) {
            throw new NotFoundHttpException('Arquivo swagger.json inválido.');
        }

        return response()->json($document);
    }
}
