<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StorePipelineStageRequest;
use App\Http\Requests\Crm\UpdatePipelineStageRequest;
use App\Models\Crm\Connection;
use App\Models\Crm\PipelineStage;
use App\Services\Crm\SyncWhatsappLabels;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PipelineStageController extends Controller
{
    public function __construct(private SyncWhatsappLabels $labelSync) {}
    public function index(Request $request): JsonResponse
    {
        $dados = $request->validate([
            'kind' => ['required', Rule::in(PipelineStage::KINDS)],
        ]);

        return response()->json([
            'data' => PipelineStage::ofKind($dados['kind'])
                ->where('active', true)
                ->orderBy('position')
                ->get(),
        ]);
    }

    public function store(StorePipelineStageRequest $request): JsonResponse
    {
        $data = $request->validated();
        $kind = $data['kind'];

        $slug = $data['slug'] ?? Str::slug($data['name']);
        if ($slug === '') {
            $slug = 'stage-'.Str::random(6);
        }

        $base = $slug;
        $i = 1;
        while (PipelineStage::ofKind($kind)->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i;
            $i++;
        }

        $flags = isset($data['status'])
            ? PipelineStage::flagsFor($data['status'])
            : PipelineStage::normalizeFlags($data);

        $stage = PipelineStage::create(array_merge([
            'kind' => $kind,
            'slug' => $slug,
            'name' => $data['name'],
            'color' => $data['color'] ?? '#6b7280',
            'position' => ((int) PipelineStage::ofKind($kind)->max('position')) + 1,
            'active' => true,
        ], $flags));

        $connection = Connection::query()->first();
        if ($connection) {
            $this->labelSync->ensureStageLabel($connection, $stage);
        }

        return response()->json(['data' => $stage], 201);
    }

    public function update(UpdatePipelineStageRequest $request, PipelineStage $pipelineStage): JsonResponse
    {
        $data = $request->validated();
        $nomeAnterior = $pipelineStage->name;

        if (isset($data['status'])) {
            $data = array_merge($data, PipelineStage::flagsFor($data['status']));
            unset($data['status']);
        } elseif (
            array_key_exists('is_open', $data)
            || array_key_exists('is_in_progress', $data)
            || array_key_exists('is_won', $data)
            || array_key_exists('is_lost', $data)
        ) {
            $data = array_merge($data, PipelineStage::normalizeFlags(array_merge([
                'is_open' => $pipelineStage->is_open,
                'is_in_progress' => $pipelineStage->is_in_progress,
                'is_won' => $pipelineStage->is_won,
                'is_lost' => $pipelineStage->is_lost,
            ], $data)));
        }

        $pipelineStage->update($data);
        $fresh = $pipelineStage->fresh();

        if (isset($data['name']) && (string) $data['name'] !== (string) $nomeAnterior) {
            $connection = Connection::query()->first();
            if ($connection) {
                $this->labelSync->ensureStageLabel($connection, $fresh);
            }
        }

        return response()->json(['data' => $fresh]);
    }

    public function destroy(PipelineStage $pipelineStage): JsonResponse
    {
        if ($pipelineStage->kind === 'lead') {
            if ($pipelineStage->leads()->where('status', '!=', 'converted')->exists()) {
                throw ValidationException::withMessages([
                    'stage' => 'Não é possível excluir: o estágio ainda tem leads. Mova-os antes.',
                ]);
            }
        } elseif ($pipelineStage->deals()->exists()) {
            throw ValidationException::withMessages([
                'stage' => 'Não é possível excluir: o estágio ainda tem negócios. Mova-os antes.',
            ]);
        }

        $pipelineStage->delete();

        return response()->json(['data' => true]);
    }

    public function order(Request $request): JsonResponse
    {
        $dados = $request->validate([
            'kind' => ['required', Rule::in(PipelineStage::KINDS)],
            'ordered_ids' => ['required', 'array', 'min:1'],
            'ordered_ids.*' => ['integer'],
        ]);

        $kind = $dados['kind'];
        $ativos = PipelineStage::ofKind($kind)
            ->where('active', true)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $recebidos = array_map('intval', $dados['ordered_ids']);

        if (array_diff($recebidos, $ativos) || count($recebidos) !== count($ativos)) {
            throw ValidationException::withMessages([
                'ordered_ids' => 'A lista deve conter exatamente os estágios ativos deste pipeline.',
            ]);
        }

        foreach ($recebidos as $i => $id) {
            PipelineStage::where('id', $id)->update(['position' => $i + 1]);
        }

        return response()->json([
            'data' => PipelineStage::ofKind($kind)
                ->where('active', true)
                ->orderBy('position')
                ->get(),
        ]);
    }
}
