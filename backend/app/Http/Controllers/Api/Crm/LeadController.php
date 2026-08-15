<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\ConvertLeadRequest;
use App\Http\Requests\Crm\MoveLeadRequest;
use App\Http\Requests\Crm\StoreLeadRequest;
use App\Http\Requests\Crm\UpdateLeadRequest;
use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use App\Services\Crm\ConvertLead;
use App\Services\Crm\EnsureContactForLead;
use App\Services\Crm\FinalizeWhatsappConversationForLead;
use App\Services\Crm\MoveLead;
use App\Services\Crm\PauseWhatsappAgentIndefinitelyForLead;
use App\Services\Crm\PauseWhatsappAgentWithAutoResumeForLead;
use App\Services\Crm\ResumeWhatsappAgentForLead;
use App\Services\Crm\TrackWhatsappAttendanceSegment;
use App\Services\Crm\UpsertClinicConnection;
use App\Models\Crm\WhatsappAttendanceSegment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Lead::query()
            ->with(['contact', 'organization', 'owner', 'source', 'stage'])
            ->latest();

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($search = trim((string) $request->query('search'))) {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->whereLike('name', $like, caseSensitive: false)
                    ->orWhereLike('title', $like, caseSensitive: false)
                    ->orWhereLike('email', $like, caseSensitive: false)
                    ->orWhereLike('mobile', $like, caseSensitive: false)
                    ->orWhereLike('organization_name', $like, caseSensitive: false);
            });
        }

        return response()->json($query->paginate(50));
    }

    public function store(
        StoreLeadRequest $request,
        EnsureContactForLead $ensureContact,
        TrackWhatsappAttendanceSegment $attendance,
    ): JsonResponse {
        $data = $request->validated();
        $data['title'] = $data['title'] ?? $data['name'];
        $data['status'] = $data['status'] ?? 'new';

        if (empty($data['stage_id'])) {
            $data['stage_id'] = PipelineStage::ofKind('lead')
                ->where('active', true)
                ->orderBy('position')
                ->value('id');
        }

        $lead = Lead::create($data);
        $ensureContact->handle($lead);

        if (! $lead->isWhatsappAgentPaused()) {
            $attendance->handle(
                $lead->fresh() ?? $lead,
                WhatsappAttendanceSegment::MODE_AI,
                null,
                'lead_created',
            );
        }

        return response()->json(
            ['data' => $lead->fresh(['contact', 'source', 'owner', 'stage'])],
            201,
        );
    }

    public function show(Lead $lead): JsonResponse
    {
        $lead->load([
            'contact',
            'organization',
            'owner',
            'source',
            'stage',
            'convertedDeal.stage',
            'activities' => fn ($q) => $q->latest()->with('user'),
            'attendanceSegments' => fn ($q) => $q->latest('started_at')->with('user'),
            'tasks' => fn ($q) => $q->orderedByDue()->with('user'),
        ]);

        return response()->json(['data' => $lead]);
    }

    public function update(
        UpdateLeadRequest $request,
        Lead $lead,
        PauseWhatsappAgentWithAutoResumeForLead $pauseWithResume,
        UpsertClinicConnection $upsertConnection,
        TrackWhatsappAttendanceSegment $attendance,
    ): JsonResponse {
        $data = $request->validated();
        $previousOwnerId = $lead->owner_id;

        $lead->update($data);

        $ownerChanged = array_key_exists('owner_id', $data)
            && $data['owner_id'] !== null
            && (int) $data['owner_id'] !== (int) ($previousOwnerId ?? 0);

        if ($ownerChanged) {
            $connection = $upsertConnection->handle([], $request->user()?->id);
            $fresh = $lead->fresh() ?? $lead;
            $pauseWithResume->handle(
                $fresh,
                $connection,
                (int) $data['owner_id'],
                $previousOwnerId ? 'transfer' : 'assume',
            );
            $attendance->handle(
                $fresh->fresh() ?? $fresh,
                WhatsappAttendanceSegment::MODE_HUMAN,
                (int) $data['owner_id'],
                $previousOwnerId ? 'transfer' : 'assume',
            );
        }

        return response()->json(['data' => $lead->fresh(['contact', 'organization', 'owner', 'source', 'stage'])]);
    }

    public function destroy(Lead $lead): JsonResponse
    {
        $lead->delete();

        return response()->json(['ok' => true]);
    }

    public function convert(ConvertLeadRequest $request, Lead $lead, ConvertLead $converter): JsonResponse
    {
        $deal = $converter->handle($lead, $request->validated(), $request->user()?->id);

        return response()->json(['data' => $deal], 201);
    }

    public function move(MoveLeadRequest $request, Lead $lead, MoveLead $movedor): JsonResponse
    {
        $dados = $request->validated();
        $atualizado = $movedor->handle(
            $lead,
            (int) $dados['stage_id'],
            $request->user()?->id,
            $dados['lost_reason'] ?? null,
        );

        return response()->json(['data' => $atualizado]);
    }

    public function resumeAgent(Lead $lead, ResumeWhatsappAgentForLead $resumer): JsonResponse
    {
        return response()->json(['data' => $resumer->handle($lead)]);
    }

    public function pauseAgent(
        Request $request,
        Lead $lead,
        PauseWhatsappAgentIndefinitelyForLead $pauser,
    ): JsonResponse {
        return response()->json([
            'data' => $pauser->handle($lead, $request->user()?->id, 'pause'),
        ]);
    }

    public function finalizeWhatsapp(
        Request $request,
        Lead $lead,
        FinalizeWhatsappConversationForLead $finalizer,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user !== null, 401);

        return response()->json(['data' => $finalizer->handle($lead, $user)]);
    }
}
