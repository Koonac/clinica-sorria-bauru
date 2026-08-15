<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_attendance_segments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $table->string('mode', 16); // ai | human
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->string('source', 40)->nullable();
            $table->timestamps();

            $table->index(['lead_id', 'ended_at']);
            $table->index(['lead_id', 'mode']);
            $table->index(['user_id', 'mode']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_attendance_segments');
    }
};
