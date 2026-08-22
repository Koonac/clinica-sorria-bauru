<?php

use App\Models\Clinic;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $clinicId = Clinic::query()->where('slug', 'sorria-bauru')->value('id')
            ?? Clinic::query()->orderBy('id')->value('id');

        if (! $clinicId) {
            return;
        }

        DB::table('users')
            ->where('role', User::ROLE_ADMIN)
            ->whereNull('clinic_id')
            ->update(['clinic_id' => $clinicId]);
    }

    public function down(): void
    {
        // Intencional: não desfaz o vínculo de admins órfãos.
    }
};
