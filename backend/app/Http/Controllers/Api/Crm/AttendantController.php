<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\ClinicContext;
use Illuminate\Http\JsonResponse;

class AttendantController extends Controller
{
    public function __construct(private ClinicContext $clinicContext) {}

    public function index(): JsonResponse
    {
        $clinicId = $this->clinicContext->id();

        $query = User::query()
            ->orderBy('name')
            ->select(['id', 'name']);

        if ($clinicId !== null) {
            $query->where(function ($q) use ($clinicId) {
                $q->where('clinic_id', $clinicId)
                    ->orWhereIn('role', [User::ROLE_ADMIN, User::ROLE_DEVELOPER]);
            });
        }

        return response()->json([
            'data' => $query->get()->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
            ])->values(),
        ]);
    }
}
