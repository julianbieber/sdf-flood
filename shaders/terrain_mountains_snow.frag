#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout(binding = 3) readonly buffer eyeBuffer {
    float v[];
} eyes;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define PI 3.1415926538
#define TAU 6.2831853071
#define MAX_STEPS 128
#define MAX_DIST 100.0
#define SURF_DIST 0.001
#define snow_threshold 10.0

const vec3 light_dir = vec3(0.0, 1.0, 0.0);

// ===== NOISE FUNCTIONS =====

// Hash function for pseudo-random values
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D Perlin noise
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    return mix(
        mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// Fractal Brownian Motion for terrain generation
float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < octaves; i++) {
        value += amplitude * noise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value;
}

// Worley noise for rock textures
float worley(vec3 p) {
    vec3 id = floor(p);
    vec3 f = fract(p);
    
    float min_dist = 1.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            for (int z = -1; z <= 1; z++) {
                vec3 neighbor = vec3(x, y, z);
                vec3 point = hash(id + neighbor) * vec3(1.0) + neighbor;
                float dist = length(point - f);
                min_dist = min(min_dist, dist);
            }
        }
    }
    return min_dist;
}

// Ridged noise for mountain ridges
float ridged(vec3 p) {
    return 1.0 - abs(noise(p) * 2.0 - 1.0);
}

// ===== SIGNED DISTANCE FUNCTIONS =====

// Terrain height function using multiple noise layers
float terrainHeight(vec2 xz) {
    vec3 p = vec3(xz.x, 0, xz.y);
    
    // Base terrain with FBM
    float height = fbm(p * 0.01, 6) * 20.0;
    
    // Add mountain ridges
    height += ridged(p * 0.005) * 15.0;
    
    // Add smaller rock details
    height += worley(p * 0.1) * 2.0;
    
    // Add fine surface details
    height += fbm(p * 0.2, 4) * 0.5;
    
    return height;
}

// Terrain SDF
float sdTerrain(vec3 p) {
    return p.y - terrainHeight(p.xz);
}

// Tree SDF (simplified cylinder with noise)
float sdTree(vec3 p) {
    // Move to local tree space
    p.y -= 3.0; // Tree height offset
    
    // Trunk
    float trunk = length(p.xz) - 0.3;
    trunk = max(trunk, -p.y);
    trunk = max(trunk, p.y - 6.0);
    
    // Add bark texture
    trunk += noise(p * 10.0) * 0.05;
    
    // Foliage (simplified as sphere)
    vec3 foliage_pos = p - vec3(0, 4, 0);
    float foliage = length(foliage_pos) - 2.0;
    foliage += noise(foliage_pos * 5.0) * 0.3;
    
    return min(trunk, foliage);
}

// Main scene SDF
float map(vec3 p) {
    float terrain = sdTerrain(p);
    
    // Add trees at certain locations
    vec3 tree_pos = p;
    tree_pos.xz = mod(tree_pos.xz + 10.0, 20.0) - 10.0;
    
    // Only place trees where terrain is relatively flat
    float terrain_height = terrainHeight(p.xz);
    vec3 terrain_normal = normalize(vec3(
        terrainHeight(p.xz + vec2(0.1, 0)) - terrainHeight(p.xz - vec2(0.1, 0)),
        0.2,
        terrainHeight(p.xz + vec2(0, 0.1)) - terrainHeight(p.xz - vec2(0, 0.1))
    ));
    
    float tree_placement = step(0.8, terrain_normal.y) * step(0.5, hash(floor(vec3(p.xz, 0.0) / 20.0)));
    
    if (tree_placement > 0.5) {
        tree_pos.y -= terrain_height;
        float tree = sdTree(tree_pos);
        terrain = min(terrain, tree);
    }
    
    return terrain;
}

// ===== MATERIAL FUNCTIONS =====

// Calculate surface normal using finite differences
vec3 getNormal(vec3 p) {
    const float h = 0.001;
    const vec2 k = vec2(1, -1);
    return normalize(k.xyy * map(p + k.xyy * h) +
                     k.yyx * map(p + k.yyx * h) +
                     k.yxy * map(p + k.yxy * h) +
                     k.xxx * map(p + k.xxx * h));
}

// Determine material type based on surface properties
vec3 getMaterial(vec3 p, vec3 normal) {
    float height = p.y;
    float slope = dot(normal, vec3(0, 1, 0));
    
    // Snow placement logic
    bool has_snow = slope > snow_threshold && height > 5.0;
    
    // Base rock color
    vec3 rock_color = vec3(0.4, 0.35, 0.3);
    rock_color *= 0.8 + 0.4 * worley(p * 0.5); // Rock texture
    
    // Snow color
    vec3 snow_color = vec3(0.95, 0.95, 1.0);
    
    // Grass color (lower areas with good slope)
    vec3 grass_color = vec3(0.2, 0.6, 0.1);
    
    // Choose material based on conditions
    if (has_snow) {
        return mix(rock_color, snow_color, 0.9);
    } else if (slope > 0.7 && height < 10.0) {
        return mix(rock_color, grass_color, 0.6);
    } else {
        return rock_color;
    }
}

// ===== CLOUD RENDERING =====

// Volumetric cloud density
float cloudDensity(vec3 p) {
    // Move clouds
    p += vec3(u.time * 2.0, 0, u.time * 0.5);
    
    // Base cloud shape
    float density = fbm(p * 0.02, 5);
    density = smoothstep(0.4, 0.6, density);
    
    // Add cloud details
    density *= fbm(p * 0.1, 3);
    
    // Height falloff
    density *= smoothstep(0.0, 5.0, p.y) * smoothstep(25.0, 20.0, p.y);
    
    return density;
}

// Cloud lighting
vec3 cloudLighting(vec3 p, vec3 rd) {
    float density = cloudDensity(p);
    
    // Sample towards light for shadowing
    float light_density = 0.0;
    vec3 light_sample = p;
    for (int i = 0; i < 6; i++) {
        light_sample += light_dir * 0.5;
        light_density += cloudDensity(light_sample);
    }
    
    float light_attenuation = exp(-light_density * 0.1);
    
    vec3 cloud_color = vec3(1.0, 1.0, 1.0);
    cloud_color *= light_attenuation;
    
    return cloud_color * density;
}

// ===== RAY MARCHING =====

// Ray marching for terrain
float rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = map(p);
        dO += dS;
        
        if (dO > MAX_DIST || abs(dS) < SURF_DIST) break;
    }
    
    return dO;
}

// Cloud ray marching
vec4 rayMarchClouds(vec3 ro, vec3 rd, float max_dist) {
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    
    float t = 10.0; // Start above terrain
    for (int i = 0; i < 32; i++) {
        if (t > max_dist) break;
        
        vec3 p = ro + rd * t;
        vec3 cloud_contribution = cloudLighting(p, rd);
        
        color += cloud_contribution * (1.0 - alpha) * 0.1;
        alpha += length(cloud_contribution) * 0.1;
        
        if (alpha > 0.99) break;
        
        t += 0.5;
    }
    
    return vec4(color, alpha);
}

// ===== LIGHTING =====

// Soft shadows using ray marching
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float t = mint;
    
    for (int i = 0; i < 32; i++) {
        float h = map(ro + rd * t);
        if (h < 0.001) return 0.0;
        res = min(res, k * h / t);
        t += h;
        if (t > maxt) break;
    }
    
    return res;
}

// Phong lighting
vec3 lighting(vec3 p, vec3 rd, vec3 material) {
    vec3 normal = getNormal(p);
    vec3 light_dir = normalize(light_dir);
    vec3 view_dir = -rd;
    
    // Ambient
    vec3 ambient = material * 0.2;
    
    // Diffuse
    float diff = max(dot(normal, light_dir), 0.0);
    vec3 diffuse = material * diff * 0.8;
    
    // Specular
    vec3 reflect_dir = reflect(-light_dir, normal);
    float spec = pow(max(dot(view_dir, reflect_dir), 0.0), 32.0);
    vec3 specular = vec3(0.3) * spec * 0.5;
    
    // Soft shadows
    float shadow = softShadow(p + normal * 0.001, light_dir, 0.02, 10.0, 8.0);
    
    return ambient + (diffuse + specular) * shadow;
}

// ===== MAIN FUNCTION =====

void main() {
    vec2 pixel_position = (uv - 0.5) * 2.0;
    pixel_position.x *= 16.0/9.0; // Assume 16:9 aspect ratio
    
    // Camera setup
    vec3 ro = vec3(0.0, 0.0, -10.0);
    vec3 rd = normalize(vec3(pixel_position, 1.0));
    
    // Sky color
    vec3 sky_color = mix(vec3(0.5, 0.7, 1.0), vec3(0.8, 0.8, 0.9), pixel_position.y * 0.5 + 0.5);
    
    // Ray march terrain
    float d = rayMarch(ro, rd);
    
    vec3 final_color = sky_color;
    
    if (d < MAX_DIST) {
        // Hit terrain
        vec3 p = ro + rd * d;
        vec3 material = getMaterial(p, getNormal(p));
        final_color = lighting(p, rd, material);
    }
    
    // Add clouds
    vec4 clouds = rayMarchClouds(ro, rd, d);
    final_color = mix(final_color, clouds.rgb, clouds.a);
    
    // Fog
    float fog_amount = 1.0 - exp(-d * 0.01);
    final_color = mix(final_color, sky_color, fog_amount);
    
    // Gamma correction
    final_color = pow(final_color, vec3(1.0/2.2));
    
    out_color = vec4(final_color, 1.0);
} 
