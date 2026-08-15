<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreDealRequest;
use App\Http\Requests\Crm\UpdateDealRequest;
use App\Models\Crm\Activity;
use App\Models\Crm\Connection;
use App\Models\Crm\Deal;
use App\Models\Crm\PipelineStage;
use App\Services\Crm\SyncWhatsappLabels;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DealController extends Controller
{
    public function __construct(private SyncWhatsappLabels $labelSync) {}
    public function index(Request $request): JsonResponse
    {
        $query = Deal::query()
            ->with(['contact', 'organization', 'owner', 'source', 'stage'])
            ->latest('updated_at');

        if ($stageId = $request->query('stage_id')) {
            $query->where('stage_id', $stageId);
        }

        if ($search = trim((string) $request->query('search'))) {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->whereLike('title', $like, caseSensitive: false)
                    ->orWhereHas('contact', fn ($c) => $c->whereLike('name', $like, caseSensitive: false));
            });
        }

        return response()->json($query->paginate(50));
    }

    public function store(StoreDealRequest $request): JsonResponse
    {
        $deal = Deal::create($request->validated());
        $this->syncClosedAt($deal);

        return response()->json(
            ['data' => $deal->fresh(['contact', 'organization', 'owner', 'source', 'stage'])],
            201,
        );
    }

    public function show(Deal $deal): JsonResponse
    {
        $deal->load([
            'contact',
            'organization',
            'owner',
            'source',
            'stage',
            'lead',
            'activities' => fn ($q) => $q->latest()->with('user'),
            'tasks' => fn ($q) => $q->orderedByDue()->with('user'),
        ]);

        return response()->json(['data' => $deal]);
    }

    public function update(UpdateDealRequest $request, Deal $deal): JsonResponse
    {
        $data = $request->validated();
        $stageAnterior = $deal->stage_id;
        $origem = null;
        $destino = null;
        $stageMudou = false;

        if (array_key_exists('stage_id', $data) && (int) $data['stage_id'] !== (int) $stageAnterior) {
            $destino = PipelineStage::findOrFail($data['stage_id']);
            $origem = PipelineStage::find($stageAnterior);
            $entrandoEmPerdido = $destino->is_lost && ! ($origem?->is_lost ?? false);
            $stageMudou = true;

            if ($entrandoEmPerdido) {
                $motivo = trim((string) ($data['lost_reason'] ?? ''));
                if ($motivo === '') {
                    throw ValidationException::withMessages([
                        'lost_reason' => 'Informe o motivo da perda ao mover para um estágio perdido.',
                    ]);
                }
                $data['lost_reason'] = $motivo;
            }
        }

        DB::transaction(function () use ($deal, $data, $stageAnterior, $request, $stageMudou) {
            $deal->update($data);

            if ($stageMudou) {
                $this->syncClosedAt($deal);

                Activity::create([
                    'type' => 'stage_change',
                    'subject' => 'Negócio movido de estágio',
                    'deal_id' => $deal->id,
                    'contact_id' => $deal->contact_id,
                    'user_id' => $request->user()?->id,
                    'meta' => [
                        'from_stage_id' => (int) $stageAnterior,
                        'to_stage_id' => (int) $data['stage_id'],
                        'to_status' => $deal->stage?->status(),
                        'lost_reason' => $deal->lost_reason,
                    ],
                ]);
            }
        });

        $fresh = $deal->fresh(['contact', 'organization', 'owner', 'source', 'stage']);

        if ($stageMudou) {
            $connection = Connection::query()->first();
            if ($connection) {
                $this->labelSync->moveCardLabels(
                    $connection,
                    $fresh->whatsapp_jid ?: $fresh->contact?->whatsapp_jid,
                    $origem,
                    $destino ?? $fresh->stage,
                );
            }
        }

        return response()->json(['data' => $fresh]);
    }

    public function destroy(Deal $deal): JsonResponse
    {
        $deal->delete();

        return response()->json(['ok' => true]);
    }

    /** Atualiza closed_at conforme o estágio for terminal (ganho/perdido). */
    private function syncClosedAt(Deal $deal): void
    {
        $stage = PipelineStage::find($deal->stage_id);
        if (! $stage) {
            return;
        }

        if ($stage->isTerminal() && ! $deal->closed_at) {
            $deal->update(['closed_at' => now()]);
        } elseif (! $stage->isTerminal() && $deal->closed_at) {
            $deal->update(['closed_at' => null]);
        }
    }
}
