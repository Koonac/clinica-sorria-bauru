<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'admin@vekta.local'],
            [
                'name' => 'Vekta Admin',
                'password' => Str::password(24),
            ],
        );

        // Um token de serviço por instalação; roda de novo só se ainda não existir.
        if (! $user->tokens()->where('name', 'interface')->exists()) {
            $token = $user->createToken('interface')->plainTextToken;

            $this->command?->warn('Token de serviço da interface (guarde — não será exibido de novo):');
            $this->command?->line($token);
            $this->command?->info('Defina BACKEND_API_TOKEN com esse valor em "Vekta AI/interface/.env".');
        }
    }
}
