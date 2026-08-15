<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Crm\PipelineStage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PipelineController extends Controller
{
    /** Kanban: estágios ativos do kind informado, com leads ou deals. */
    public function index(Request $request): JsonResponse
    {
        $dados = $request->validate([
            'kind' => ['required', Rule::in(PipelineStage::KINDS)],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);

        $kind = $dados['kind'];
        $search = trim((string) ($dados['search'] ?? ''));

        $query = PipelineStage::ofKind($kind)
            ->where('active', true)
            ->orderBy('position');

        if ($kind === 'lead') {
            $query->with([
                'leads' => function ($q) use ($search) {
                    $q->where('status', '!=', 'converted')
                        ->latest('updated_at')
                        ->with([
                            'source',
                            'owner',
                            'nextPendingTask',
                        ]);

                    if ($search !== '') {
                        $like = '%'.$search.'%';
                        $q->where(function ($inner) use ($like) {
                            $inner->whereLike('name', $like, caseSensitive: false)
                                ->orWhereLike('title', $like, caseSensitive: false)
                                ->orWhereLike('email', $like, caseSensitive: false)
                                ->orWhereLike('mobile', $like, caseSensitive: false)
                                ->orWhereLike('organization_name', $like, caseSensitive: false);
                        });
                    }
                },
            ]);
        } else {
            $query->with([
                'deals' => function ($q) use ($search) {
                    $q->latest('updated_at')
                        ->with([
                            'contact',
                            'organization',
                            'owner',
                            'source',
                            'nextPendingTask',
                        ]);

                    if ($search !== '') {
                        $like = '%'.$search.'%';
                        $q->where(function ($inner) use ($like) {
                            $inner->whereLike('title', $like, caseSensitive: false)
                                ->orWhereHas(
                                    'contact',
                                    fn ($c) => $c->whereLike('name', $like, caseSensitive: false),
                                )
                                ->orWhereHas(
                                    'organization',
                                    fn ($o) => $o->whereLike('name', $like, caseSensitive: false),
                                );
                        });
                    }
                },
            ]);
        }

        return response()->json(['data' => $query->get()]);
    }
}
