<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Crm\Contact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Contact::query()->with('organization')->orderBy('name');

        if ($search = trim((string) $request->query('search'))) {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->whereLike('name', $like, caseSensitive: false)
                    ->orWhereLike('email', $like, caseSensitive: false)
                    ->orWhereLike('mobile', $like, caseSensitive: false);
            });
        }

        return response()->json($query->paginate(50));
    }
}
